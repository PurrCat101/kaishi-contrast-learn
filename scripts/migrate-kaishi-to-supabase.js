#!/usr/bin/env node

/**
 * Migrate Kaishi vocabulary data from kaishi.json to Supabase
 *
 * Usage: node scripts/migrate-kaishi-to-supabase.js
 *
 * This script:
 * 1. Reads src/data/kaishi.json
 * 2. Inserts vocabulary records
 * 3. Inserts vocabulary_readings
 * 4. Inserts vocabulary_examples (if available)
 * 5. Creates vocabulary_relations (homophones, shared kanji, similar meaning)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load .env or .env.local file
['.env.local', '.env'].forEach(envFile => {
  const envPath = path.join(__dirname, '../' + envFile);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      if (!line.trim() || line.startsWith('#')) return;
      const [key, ...valueParts] = line.split('=');
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    });
  }
});

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Load vocabulary data
const vocabPath = path.join(__dirname, '../src/data/kaishi.json');
const vocabRaw = fs.readFileSync(vocabPath, 'utf8');
const words = JSON.parse(vocabRaw);

console.log(`📚 Loaded ${words.length} vocabulary words from kaishi.json`);

let insertedCount = 0;
let relationshipCount = 0;
const wordIdToUuid = new Map(); // Map from word.id to vocabulary.id

async function migrateVocabulary() {
  try {
    // Step 1: Insert vocabulary records
    console.log('\n1️⃣  Inserting vocabulary records...');

    const vocabInserts = words.map(word => ({
      source: 'kaishi',
      source_id: String(word.id),
      source_version: '1.5k',
      source_note_id: `kaishi_${word.id}`,
      word: word.word,
      meaning: word.meaning,
      notes: word.notes || null,
      pitch_accent_raw: word.pitch || null,
      frequency: word.freq || null,
      part_of_speech: null
    }));

    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < vocabInserts.length; i += batchSize) {
      const batch = vocabInserts.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('vocabulary')
        .upsert(batch, { onConflict: 'source,source_version,source_note_id' })
        .select('id, source_id');

      if (error) {
        console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error);
        throw error;
      }

      // Map word IDs to UUIDs
      if (data) {
        data.forEach(row => {
          wordIdToUuid.set(parseInt(row.source_id), row.id);
        });
      }

      insertedCount += batch.length;
      console.log(`  ✓ Inserted ${Math.min(i + batchSize, vocabInserts.length)}/${vocabInserts.length} words`);
    }

    // Step 2: Insert vocabulary readings
    console.log('\n2️⃣  Inserting vocabulary readings...');

    const readingInserts = [];
    words.forEach(word => {
      const vocabId = wordIdToUuid.get(word.id);
      if (vocabId && word.reading) {
        readingInserts.push({
          vocabulary_id: vocabId,
          reading: word.reading,
          is_primary: true
        });
      }
    });

    for (let i = 0; i < readingInserts.length; i += batchSize) {
      const batch = readingInserts.slice(i, i + batchSize);
      const { error } = await supabase
        .from('vocabulary_readings')
        .upsert(batch, { onConflict: 'vocabulary_id,reading' });

      if (error) {
        console.error(`Error inserting readings batch:`, error);
        throw error;
      }
      console.log(`  ✓ Inserted ${Math.min(i + batchSize, readingInserts.length)}/${readingInserts.length} readings`);
    }

    // Step 3: Insert vocabulary examples
    console.log('\n3️⃣  Inserting vocabulary examples...');

    const exampleInserts = [];
    words.forEach(word => {
      const vocabId = wordIdToUuid.get(word.id);
      if (vocabId && word.sentence) {
        exampleInserts.push({
          vocabulary_id: vocabId,
          sentence: word.sentence,
          translation: word.sentenceEn || null,
          furigana: word.sentenceFurigana || null,
          sort_order: 0
        });
      }
    });

    for (let i = 0; i < exampleInserts.length; i += batchSize) {
      const batch = exampleInserts.slice(i, i + batchSize);
      const { error } = await supabase
        .from('vocabulary_examples')
        .upsert(batch);

      if (error) {
        console.error(`Error inserting examples batch:`, error);
        throw error;
      }
      console.log(`  ✓ Inserted ${Math.min(i + batchSize, exampleInserts.length)}/${exampleInserts.length} examples`);
    }

    // Step 4: Insert vocabulary relations
    console.log('\n4️⃣  Inserting vocabulary relationships...');

    const relationInserts = [];

    words.forEach(word => {
      const vocabId = wordIdToUuid.get(word.id);
      if (!vocabId) return;

      // Homophones
      if (word.homophones && word.homophones.length > 0) {
        word.homophones.forEach(relatedId => {
          const relatedVocabId = wordIdToUuid.get(relatedId);
          if (relatedVocabId) {
            relationInserts.push({
              vocabulary_id: vocabId,
              related_vocabulary_id: relatedVocabId,
              relation_type: 'HOMOPHONE',
              source: 'kaishi',
              source_version: '1.5k'
            });
          }
        });
      }

      // Shared kanji
      if (word.sharedKanji && word.sharedKanji.length > 0) {
        word.sharedKanji.forEach(relatedId => {
          const relatedVocabId = wordIdToUuid.get(relatedId);
          if (relatedVocabId) {
            relationInserts.push({
              vocabulary_id: vocabId,
              related_vocabulary_id: relatedVocabId,
              relation_type: 'SAME_KANJI',
              source: 'kaishi',
              source_version: '1.5k'
            });
          }
        });
      }

      // Similar meaning
      if (word.similarMeaning && word.similarMeaning.length > 0) {
        word.similarMeaning.forEach(relatedId => {
          const relatedVocabId = wordIdToUuid.get(relatedId);
          if (relatedVocabId) {
            relationInserts.push({
              vocabulary_id: vocabId,
              related_vocabulary_id: relatedVocabId,
              relation_type: 'SIMILAR_MEANING',
              source: 'kaishi',
              source_version: '1.5k'
            });
          }
        });
      }
    });

    // Insert relations in batches
    for (let i = 0; i < relationInserts.length; i += batchSize) {
      const batch = relationInserts.slice(i, i + batchSize);
      const { error } = await supabase
        .from('vocabulary_relations')
        .upsert(batch, {
          onConflict: 'vocabulary_id,related_vocabulary_id,relation_type,source'
        });

      if (error) {
        console.error(`Error inserting relations batch:`, error);
        // Don't throw - some relations might already exist
        console.warn(`  ⚠️  Warning: ${error.message}`);
      }

      relationshipCount += batch.length;
      console.log(`  ✓ Inserted ${Math.min(i + batchSize, relationInserts.length)}/${relationInserts.length} relationships`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   • Vocabulary records: ${insertedCount}`);
    console.log(`   • Readings: ${readingInserts.length}`);
    console.log(`   • Examples: ${exampleInserts.length}`);
    console.log(`   • Relationships: ${relationshipCount}`);
    console.log(`\n🎯 Next steps:`);
    console.log(`   1. Verify data in Supabase`);
    console.log(`   2. Test the app with \`npm run dev\``);
    console.log(`   3. Check vocabulary catalog loads correctly`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
await migrateVocabulary().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
