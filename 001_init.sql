-- Super Mart schema (PostgreSQL). Timestamps are epoch milliseconds (BIGINT).
CREATE TABLE users(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created BIGINT NOT NULL
);
CREATE TABLE sessions(
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires BIGINT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE images(
  id BIGSERIAL PRIMARY KEY,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created BIGINT NOT NULL
);
CREATE TABLE products(
  id BIGSERIAL PRIMARY KEY,
  n TEXT NOT NULL,
  c TEXT NOT NULL,
  p INTEGER NOT NULL,
  m INTEGER NOT NULL,
  e TEXT NOT NULL,
  b TEXT NOT NULL,
  image_id BIGINT REFERENCES images(id) ON DELETE SET NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  created BIGINT NOT NULL
);
CREATE TABLE orders(
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  total INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pin TEXT NOT NULL,
  address TEXT NOT NULL,
  payment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Placed',
  created BIGINT NOT NULL
);
CREATE INDEX orders_user ON orders(user_id, created);
CREATE TABLE order_items(
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE TABLE ratings(
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK(stars BETWEEN 1 AND 5),
  created BIGINT NOT NULL,
  PRIMARY KEY(user_id, product_id)
);
