require('dotenv').config();

const mysql = require('mysql2/promise');

const pool = mysql.createPool({

    host: process.env.DB_HOST,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD,

    database: process.env.DB_NAME,

    port: Number(process.env.DB_PORT) || 4000,

    waitForConnections: true,

    connectionLimit: 10,

    queueLimit: 0,

    connectTimeout: 20000,

    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
        // no `ca` needed — Node's default trust store already trusts TiDB's cert
    }

});

module.exports = pool;