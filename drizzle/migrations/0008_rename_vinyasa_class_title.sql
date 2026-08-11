-- Data migration: rename the vinyasa class from "Vinyasa Yoga Seasonal Flow"
-- to "Autumn Equinox Yin". The slug stays "vinyasa" so /classes/vinyasa is unchanged.
UPDATE "classes" SET "title" = 'Autumn Equinox Yin' WHERE "slug" = 'vinyasa';
