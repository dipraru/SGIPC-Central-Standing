import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { execSync } from "child_process";
import fs from "fs";
import { GymContest } from "../models/GymContest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

async function runMigration() {
  console.log("Starting migration of ContestSetter data to MongoDB...");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI not found in environment.");
  }

  // 1. Extract data from SQLite using python
  const tempJsonPath = path.resolve(__dirname, "temp_contests_dump.json");
  const pyScript = `
import sqlite3, json

conn = sqlite3.connect('/home/dipra/contestSetter/contests.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute('SELECT * FROM contest_problems ORDER BY contest_id, problem_index;')
probs_by_contest = {}
for p in c.fetchall():
    cid = p['contest_id']
    if cid not in probs_by_contest:
        probs_by_contest[cid] = []
    probs_by_contest[cid].append({
        'problemIndex': str(p['problem_index'] or ''),
        'name': str(p['name'] or ''),
        'contestSolves': int(p['contest_solves'] or 0),
        'allTimeSolves': int(p['all_time_solves'] or 0)
    })

c.execute('SELECT * FROM contests ORDER BY id;')
contests = []
for row in c.fetchall():
    d = dict(row)
    cid = d['id']
    cat_scores = d.get('category_scores')
    if cat_scores and isinstance(cat_scores, str):
        try:
            cat_scores = json.loads(cat_scores)
        except Exception:
            cat_scores = {}
    elif not isinstance(cat_scores, dict):
        cat_scores = {}

    contests.append({
        'id': int(d['id']),
        'name': str(d['name']),
        'type': str(d.get('type') or 'ICPC'),
        'phase': str(d.get('phase') or 'FINISHED'),
        'durationSeconds': int(d.get('duration_seconds') or 0),
        'startTimeSeconds': int(d.get('start_time_seconds') or 0),
        'difficulty': int(d.get('difficulty') or 0),
        'kind': str(d.get('kind') or ''),
        'season': str(d.get('season') or ''),
        'city': d.get('city'),
        'websiteUrl': d.get('website_url'),
        'problemsCount': int(d.get('problems_count') or 0),
        'totalContestSolves': int(d.get('total_contest_solves') or 0),
        'totalAllTimeSolves': int(d.get('total_all_time_solves') or 0),
        'hasProblemData': bool(d.get('has_problem_data', 0)),
        'isDone': bool(d.get('is_done', 0)),
        'category': str(d.get('category') or 'standard'),
        'categoryScores': {
            'standard': float(cat_scores.get('standard', 0)),
            'spike': float(cat_scores.get('spike', 0)),
            'equilibrium': float(cat_scores.get('equilibrium', 0))
        },
        'categoryExplanation': str(d.get('category_explanation') or ''),
        'problems': probs_by_contest.get(cid, [])
    })

with open('${tempJsonPath}', 'w', encoding='utf-8') as f:
    json.dump(contests, f)

print(f"Exported {len(contests)} contests successfully.")
`;

  console.log("Extracting SQLite records...");
  execSync(`python3 -c "${pyScript.replace(/"/g, '\\"')}"`, { stdio: "inherit" });

  const rawJson = fs.readFileSync(tempJsonPath, "utf-8");
  const contests = JSON.parse(rawJson);
  fs.unlinkSync(tempJsonPath);

  console.log(`Loaded ${contests.length} contests into memory. Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB successfully!");

  // Bulk upsert in batches of 500
  const BATCH_SIZE = 500;
  let processed = 0;

  for (let i = 0; i < contests.length; i += BATCH_SIZE) {
    const batch = contests.slice(i, i + BATCH_SIZE);
    const ops = batch.map((item) => ({
      updateOne: {
        filter: { id: item.id },
        update: { $set: item },
        upsert: true,
      },
    }));

    await GymContest.bulkWrite(ops);
    processed += batch.length;
    console.log(`Processed ${processed}/${contests.length} contests...`);
  }

  const totalInDb = await GymContest.countDocuments();
  const doneInDb = await GymContest.countDocuments({ isDone: true });
  const categoryStats = await GymContest.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);

  console.log("=== MIGRATION COMPLETE ===");
  console.log(`Total Gym Contests in MongoDB: ${totalInDb}`);
  console.log(`Marked Done: ${doneInDb}`);
  console.log("Category breakdown:", categoryStats);

  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
