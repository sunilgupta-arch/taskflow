-- Migration 017: Switch entire system to America/New_York (Eastern Time)
-- All TIMESTAMP columns auto-adjust when session timezone changes (no data conversion needed).
-- Only TIME fields (shift_start) need manual IST -> ET conversion.

-- Step 1: Update both organization timezones to Eastern
UPDATE organizations SET timezone = 'America/New_York';

-- Step 2: Convert shift_start from IST (UTC+5:30) to EDT (UTC-4:00)
-- Uses numeric offsets so it works even without MySQL timezone tables loaded
UPDATE users
SET shift_start = TIME(CONVERT_TZ(CONCAT('2026-04-07 ', shift_start), '+05:30', '-04:00'))
WHERE shift_start IS NOT NULL;
