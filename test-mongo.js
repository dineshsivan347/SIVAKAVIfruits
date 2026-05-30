import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

function uriUsername(connectionUri) {
  const m = connectionUri.match(/^mongodb(?:\+srv)?:\/\/([^:/]+)/);
  return m ? m[1] : '(could not parse)';
}

try {
  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected successfully!');
  await client.close();
} catch (err) {
  if (err.code === 8000 || err.codeName === 'AtlasError' || /bad auth/i.test(err.message)) {
    console.error('MongoDB authentication failed.');
    console.error(`  URI username: ${uriUsername(uri)}`);
    console.error('  Atlas → Database Access: confirm this user exists and the password matches .env.');
    console.error('  Atlas → Connect → Drivers: copy a new connection string into MONGO_URI in .env.');
    console.error('  If the password has @ # % & etc., URL-encode it or use the string Atlas gives you.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
}