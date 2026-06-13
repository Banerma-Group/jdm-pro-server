const base = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  logging: false, // enable per-env if you need it
  benchmark: false, // turn on when profiling
  pool: {
    max: 25, // start here; tune based on app concurrency
    min: 5,
    idle: 30000, // close idle conns after 30s
    acquire: 60000, // wait up to 60s for a conn
    evict: 30000, // run eviction every 30s
  },
  define: {
    timestamps: true,
  },
  retry: { max: 3 }, // transient errors
};

// Local Postgres (Docker) doesn't speak SSL; remote managed DBs (Render) require it.
const isLocalDb = /@(localhost|127\.0\.0\.1)(:|\/)/.test(process.env.DATABASE_URL || '');

module.exports = {
  development: {
    ...base,
    dialectOptions: isLocalDb
      ? {}
      : {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
  },
  test: {
    url: process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/test_db',
    dialect: 'postgres',
    logging: false,
    pool: { max: 5, min: 0, idle: 10000, acquire: 30000, evict: 15000 },
    dialectOptions: { statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 },
    define: { timestamps: true },
  },
  production: {
    ...base,
    logging: false, // or a custom logger if needed
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  },
};
