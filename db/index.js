const { parse } = require('pg-connection-string');
const { Client } = require('pg');

const {
  DB_URI,
} = process.env;

if (!DB_URI) throw new Error('DB_URI is not defined');
const parsed = parse(DB_URI);

const DB_CONFIG = {
  database: parsed.database,
  host: parsed.host,
  user: parsed.user,
  password: parsed.password,
  port: parsed.port,
};

const getDb = async () => {
  const client = new Client(DB_CONFIG);
  client.connect();
  return client;
};


module.exports = {
  getDb,
};
