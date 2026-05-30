import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI;

try {
  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected successfully!');
  await client.close();
} catch (err) {
  console.error(err);
}