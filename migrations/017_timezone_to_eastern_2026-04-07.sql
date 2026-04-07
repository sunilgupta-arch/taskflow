-- Migration 017: Switch entire system to America/New_York (Eastern Time)
-- All TIMESTAMP columns auto-adjust when session timezone changes (no data conversion needed).
-- Only TIME fields (shift_start) need manual IST -> ET conversion.

-- Step 1: Update both organization timezones to Eastern
UPDATE organizations SET timezone = 'America/New_York';

-- Step 2: Convert shift_start from IST to ET
-- Uses CONVERT_TZ on a reference date (2026-04-07) to get correct DST-aware offset
UPDATE users
SET shift_start = TIME(CONVERT_TZ(CONCAT('2026-04-07 ', shift_start), 'Asia/Kolkata', 'America/New_York'))
WHERE shift_start IS NOT NULL;
