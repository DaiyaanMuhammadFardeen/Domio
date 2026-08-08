-- 0068_phase18_notifications_guests.down.sql
-- Drop notification + guest tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS guest_access CASCADE;
DROP TABLE IF EXISTS notification_subscription CASCADE;

COMMIT;
