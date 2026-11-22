CREATE TABLE IF NOT EXISTS deleted_contents (
    id uuid PRIMARY KEY,
    content_type varchar(100) NOT NULL,
    added_at timestamp with time zone NOT NULL,
    taken_at date NULL,
    dirty boolean NOT NULL,
    description text NOT NULL,
    deleted_at timestamp with time zone NOT NULL,
    tags_json jsonb NOT NULL,
    period_links_json jsonb NOT NULL,
    title_period_ids_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_deleted_contents_deleted_at
    ON deleted_contents (deleted_at);
