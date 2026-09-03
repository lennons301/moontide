-- Production-shaped data for the CI migration check.
--
-- CI applies the migrations as they stood before this branch, loads this file,
-- and only then applies the branch's migrations — so a migration meets rows
-- rather than empty tables. That is the case an empty database cannot cover:
-- a NOT NULL column with no default, a unique index over duplicate data, a
-- backfill that trips over a null.
--
-- This is not a fixture for the test suite (those are all mocked) and it is
-- not the local dev seed. It exists to make migrations meet data, so it wants
-- breadth over volume: every status of every table, and the awkward rows —
-- a cancelled class, an oversold one, a held seat with an outstanding offer,
-- a released booking nobody has rescheduled.
--
-- CI reads this file as it stood on the base commit, because it stands for
-- data that already exists and so must match the schema that exists before
-- the branch's migrations run. Write it against the schema on master; a PR
-- that adds a column should not add it here in the same breath.

-- Admin (Better Auth)
INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
  ('usr_seed_gabrielle', 'Gabrielle', 'gabrielle@example.com', true, now() - interval '400 days', now() - interval '400 days');

INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES
  ('acc_seed_gabrielle', 'usr_seed_gabrielle', 'credential', 'usr_seed_gabrielle', 'seed:not-a-real-hash', now() - interval '400 days', now() - interval '400 days');

INSERT INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) VALUES
  ('ses_seed_gabrielle', now() + interval '7 days', 'seed-session-token', now() - interval '1 day', now() - interval '1 day', '203.0.113.10', 'Mozilla/5.0', 'usr_seed_gabrielle');

INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES
  ('ver_seed_expired', 'gabrielle@example.com', 'seed-verification-value', now() - interval '2 days', now() - interval '3 days', now() - interval '3 days');

-- Classes: the four taught classes plus the enquiry-only offerings.
INSERT INTO classes (id, slug, sanity_id, category, booking_type, active, price_in_pence, title, bundle_eligible) VALUES
  (1, 'prenatal-yoga', 'service-prenatal-yoga', 'class', 'stripe', true, 1400, 'Prenatal Yoga', true),
  (2, 'postnatal-yoga', 'service-postnatal-yoga', 'class', 'stripe', true, 1400, 'Postnatal Yoga', true),
  (3, 'baby-yoga', 'service-baby-yoga', 'class', 'stripe', true, 1200, 'Baby Yoga', true),
  (4, 'vinyasa-flow', 'service-vinyasa-flow', 'class', 'stripe', true, 1000, 'Vinyasa Flow', false),
  (5, 'one-to-one-coaching', 'service-coaching', 'coaching', 'contact', true, 6000, 'One-to-One Coaching', false),
  (6, 'moon-circle', 'service-moon-circle', 'community', 'contact', false, 0, 'Moon Circle', false);

INSERT INTO bundle_config (id, name, price_in_pence, credits, expiry_days, active, created_at, updated_at) VALUES
  (1, 'Six class bundle', 7500, 6, 120, true, now() - interval '200 days', now() - interval '30 days'),
  (2, 'Ten class bundle', 12000, 10, 180, false, now() - interval '200 days', now() - interval '90 days');

-- Schedules: past and upcoming, and each status a schedule can be in.
INSERT INTO schedules (id, class_id, date, start_time, end_time, capacity, booked_count, location, recurring_rule, status) VALUES
  (1, 1, CURRENT_DATE - 14, '09:30', '10:30', 8, 8, 'The Studio, Hove', 'weekly', 'open'),
  (2, 2, CURRENT_DATE - 7, '11:00', '12:00', 8, 3, 'The Studio, Hove', 'weekly', 'open'),
  -- Closed to bookings while seats remain: what `full` used to be reached for,
  -- and the row `0017_schedule_closed_status` converted from it.
  (3, 1, CURRENT_DATE + 3, '09:30', '10:30', 8, 5, 'The Studio, Hove', 'weekly', 'closed'),
  (4, 3, CURRENT_DATE + 5, '13:00', '14:00', 10, 9, 'The Studio, Hove', 'weekly', 'open'),
  (5, 4, CURRENT_DATE + 10, '18:30', '19:45', 12, 12, 'Church Hall, Portslade', 'weekly', 'open'),
  (6, 2, CURRENT_DATE + 12, '11:00', '12:00', 8, 0, 'The Studio, Hove', 'weekly', 'cancelled'),
  -- A class whose capacity a sale raised: it was full at 12 when a paid
  -- booking arrived, and `forceClaimSeat` took the seat and the capacity with
  -- it. It used to be seeded oversold (13 of 12), which the CHECK added in
  -- `0014_capacity_backstop` no longer allows to exist.
  (7, 4, CURRENT_DATE + 21, '18:30', '19:45', 13, 13, 'Church Hall, Portslade', NULL, 'open');

-- Bundles: one of each status, including one whose credits ran out.
INSERT INTO bundles (id, customer_email, credits_total, credits_remaining, stripe_payment_id, purchased_at, expires_at, status, email_sent) VALUES
  (1, 'priya@example.com', 6, 3, 'pi_seed_bundle_active', now() - interval '30 days', now() + interval '90 days', 'active', true),
  (2, 'rosa@example.com', 6, 0, 'pi_seed_bundle_exhausted', now() - interval '80 days', now() + interval '40 days', 'exhausted', true),
  (3, 'ines@example.com', 6, 2, 'pi_seed_bundle_expired', now() - interval '200 days', now() - interval '5 days', 'expired', true);

-- Bookings: one per status. The partial unique index allows one active booking
-- per customer per schedule, so cancelled rows are the only repeats.
INSERT INTO bookings (id, schedule_id, customer_name, customer_email, stripe_payment_id, bundle_id, status, created_at, email_sent, original_schedule_id, rescheduled_at, released_at) VALUES
  (1, 1, 'Amelia Hart', 'amelia@example.com', 'pi_seed_card_1', NULL, 'confirmed', now() - interval '20 days', true, NULL, NULL, NULL),
  (2, 1, 'Priya Nair', 'priya@example.com', NULL, 1, 'confirmed', now() - interval '19 days', true, NULL, NULL, NULL),
  (3, 2, 'Amelia Hart', 'amelia@example.com', 'pi_seed_card_2', NULL, 'cancelled', now() - interval '15 days', true, NULL, NULL, NULL),
  (4, 2, 'Rosa Klein', 'rosa@example.com', NULL, 2, 'confirmed', now() - interval '14 days', true, NULL, NULL, NULL),
  -- Moved from schedule 1 to schedule 2.
  (5, 2, 'Nadia Osei', 'nadia@example.com', 'pi_seed_card_3', NULL, 'confirmed', now() - interval '25 days', true, 1, now() - interval '9 days', NULL),
  (6, 3, 'Priya Nair', 'priya@example.com', 'pi_seed_card_4', NULL, 'confirmed', now() - interval '6 days', true, NULL, NULL, NULL),
  -- Card payer owed a class, released long enough ago to want chasing.
  (7, 3, 'Sofia Marchetti', 'sofia@example.com', 'pi_seed_card_5', NULL, 'released', now() - interval '30 days', true, NULL, NULL, now() - interval '10 days'),
  (8, 4, 'Ines Duarte', 'ines@example.com', NULL, 1, 'confirmed', now() - interval '4 days', true, NULL, NULL, NULL),
  -- Seat held against the outstanding offer on waiting-list entry 3.
  (9, 5, 'Chloe Bennett', 'chloe@example.com', NULL, NULL, 'held', now() - interval '1 day', false, NULL, NULL, NULL),
  -- Confirmation email never got out; the retry cron picks this up.
  (10, 7, 'Farah Aziz', 'farah@example.com', 'pi_seed_card_6', NULL, 'confirmed', now() - interval '2 days', false, NULL, NULL, NULL);

-- Waiting lists: plain entries, one outstanding offer and one already lapsed.
INSERT INTO waitlist_entries (id, schedule_id, customer_name, customer_email, created_at, email_sent, offered_at, offer_expires_at, offer_token, held_booking_id) VALUES
  (1, 3, 'Bea Lund', 'bea@example.com', now() - interval '5 days', true, NULL, NULL, NULL, NULL),
  (2, 4, 'Grace Miller', 'grace@example.com', now() - interval '3 days', true, NULL, NULL, NULL, NULL),
  (3, 5, 'Chloe Bennett', 'chloe@example.com', now() - interval '8 days', true, now() - interval '1 day', now() + interval '1 day', 'seed-offer-token-outstanding-0000000000', 9),
  (4, 5, 'Hana Sato', 'hana@example.com', now() - interval '7 days', true, NULL, NULL, NULL, NULL),
  -- Offer nobody answered, not yet settled by the daily job.
  (5, 7, 'Lena Fischer', 'lena@example.com', now() - interval '9 days', true, now() - interval '4 days', now() - interval '2 days', 'seed-offer-token-lapsed-00000000000000', NULL);

INSERT INTO contact_submissions (id, name, email, subject, message, created_at, read) VALUES
  (1, 'Marta Silva', 'marta@example.com', 'Prenatal classes', 'Are the Tuesday prenatal classes suitable at 32 weeks?', now() - interval '11 days', true),
  (2, 'Yasmin Ahmed', 'yasmin@example.com', 'Coaching enquiry', 'I would like to talk about one-to-one coaching.', now() - interval '1 day', false);

-- Explicit ids above leave the sequences behind; a migration that inserts rows
-- would collide without this.
SELECT setval(pg_get_serial_sequence('classes', 'id'), (SELECT max(id) FROM classes));
SELECT setval(pg_get_serial_sequence('bundle_config', 'id'), (SELECT max(id) FROM bundle_config));
SELECT setval(pg_get_serial_sequence('schedules', 'id'), (SELECT max(id) FROM schedules));
SELECT setval(pg_get_serial_sequence('bundles', 'id'), (SELECT max(id) FROM bundles));
SELECT setval(pg_get_serial_sequence('bookings', 'id'), (SELECT max(id) FROM bookings));
SELECT setval(pg_get_serial_sequence('waitlist_entries', 'id'), (SELECT max(id) FROM waitlist_entries));
SELECT setval(pg_get_serial_sequence('contact_submissions', 'id'), (SELECT max(id) FROM contact_submissions));
