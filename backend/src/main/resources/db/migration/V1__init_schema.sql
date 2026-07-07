CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(255)
);

CREATE TABLE categories (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id   BIGINT NOT NULL REFERENCES users(id),
    name      VARCHAR(255),
    color_hex VARCHAR(255)
);

CREATE TABLE accounts (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id),
    name             VARCHAR(255),
    institution      VARCHAR(255),
    kind             VARCHAR(50) CHECK (kind IN ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT')),
    balance          NUMERIC(14, 2) NOT NULL,
    opening_balance  NUMERIC(14, 2) NOT NULL,
    last_synced_at   TIMESTAMPTZ,
    credit_limit     NUMERIC(14, 2),
    due_day_of_month INTEGER
);

CREATE TABLE transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      BIGINT NOT NULL REFERENCES accounts(id),
    category_id     BIGINT REFERENCES categories(id),
    description     VARCHAR(255),
    amount          NUMERIC(14, 2) NOT NULL,
    occurred_on     DATE NOT NULL,
    running_balance NUMERIC(14, 2),
    series_info     VARCHAR(255)
);

CREATE TABLE budgets (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    category_id  BIGINT NOT NULL REFERENCES categories(id),
    month        DATE NOT NULL,
    limit_amount NUMERIC(14, 2) NOT NULL,
    UNIQUE (category_id, month)
);

CREATE TABLE account_history (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    field      VARCHAR(50) NOT NULL CHECK (field IN ('DISPLAY_NAME', 'EMAIL', 'PASSWORD')),
    old_value  VARCHAR(255),
    new_value  VARCHAR(255),
    changed_at TIMESTAMPTZ NOT NULL
);
