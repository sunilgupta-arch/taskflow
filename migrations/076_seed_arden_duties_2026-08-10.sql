-- Migration 076: Seed the store duty catalogue
-- Source: ArdenCounter_008318.pdf (scanned 28 July 2026), transcribed in
-- prompts/arden-counter-duties.md
--
-- Duties only. No schedules and no assignees are created -- the client decides
-- who performs what from the Duties > Catalogue screen. Until a duty_schedules
-- row exists, nothing is generated onto anyone's day.
--
-- The sheet lists "Daily duties" as the first line of each weekday block; that
-- is a pointer to the Daily Duties section rather than a duty of its own, so it
-- is not duplicated here.

SET @client_org := (SELECT id FROM organizations WHERE org_type = 'CLIENT' ORDER BY id LIMIT 1);

INSERT INTO store_duties (org_id, title, category, sort_order)
SELECT @client_org, t.title, t.category, t.sort_order
FROM (
  -- ── Daily Duties ──────────────────────────────────────────────
  SELECT 'Empty trash bins'                                              AS title, 'Daily Duties'    AS category,  1 AS sort_order
  UNION ALL SELECT 'Check bathrooms for cleanliness and supplies',            'Daily Duties',  2
  UNION ALL SELECT 'Vacuum front foyer and sweep sidewalks',                  'Daily Duties',  3
  UNION ALL SELECT 'Make sure coffee station is clean and stocked',           'Daily Duties',  4
  UNION ALL SELECT 'Stock refrigerator',                                      'Daily Duties',  5
  UNION ALL SELECT 'Make sure comp kits are stocked',                         'Daily Duties',  6
  UNION ALL SELECT 'Walk around building and pick up any trash',              'Daily Duties',  7
  UNION ALL SELECT 'Blow off parking lot, if needed',                         'Daily Duties',  8
  UNION ALL SELECT 'Scan any moves you make',                                 'Daily Duties',  9
  UNION ALL SELECT 'Keep F9 neat and orderly',                                'Daily Duties', 10
  UNION ALL SELECT 'Wear your safety belt when moving furniture',             'Daily Duties', 11

  -- ── Evening Closing (identical on every working day) ──────────
  UNION ALL SELECT 'Bay door closed and secured',                             'Evening Closing', 1
  UNION ALL SELECT 'Make sure all tools are put away, including drill on charger, drill bits, box cutters, markers, etc.', 'Evening Closing', 2
  UNION ALL SELECT 'Make sure scan gun is charging and manager posts',         'Evening Closing', 3
  UNION ALL SELECT 'Make sure tablet is charging',                            'Evening Closing', 4

  -- ── Tuesday ───────────────────────────────────────────────────
  UNION ALL SELECT 'Pull all allocated pieces to F9 and scan',                'Tuesday', 1
  UNION ALL SELECT 'Deep clean bathrooms, break room and stock room',         'Tuesday', 2
  UNION ALL SELECT 'Mop bathrooms, break room and foyer area in F1E',         'Tuesday', 3
  UNION ALL SELECT 'Prepare F9 for MTO',                                      'Tuesday', 4

  -- ── Wednesday (truck day) ─────────────────────────────────────
  UNION ALL SELECT 'Help unload truck',                                       'Wednesday',  1
  UNION ALL SELECT 'Line up MTO in the stock area with all barcodes facing the same direction', 'Wednesday', 2
  UNION ALL SELECT 'Once truck is empty, scan MTO to F9 and compare the number of pieces to paperwork', 'Wednesday', 3
  UNION ALL SELECT 'Upload the incoming MTO scan and have manager post it',   'Wednesday',  4
  UNION ALL SELECT 'Scan all items going back to 999',                        'Wednesday',  5
  UNION ALL SELECT 'Help load the truck',                                     'Wednesday',  6
  UNION ALL SELECT 'Check with manager to make sure nothing has been added',  'Wednesday',  7
  UNION ALL SELECT 'Upload scan gun and have manager post it',                'Wednesday',  8
  UNION ALL SELECT 'Move reserved items to the customer pick up area, scan and upload gun', 'Wednesday', 9
  UNION ALL SELECT 'Open all upholstery first and tag in F9',                 'Wednesday', 10
  UNION ALL SELECT 'Put them on the showroom as per the MTO',                 'Wednesday', 11
  UNION ALL SELECT 'Be sure all power pieces are plugged in and working',     'Wednesday', 12
  UNION ALL SELECT 'Scan all items to location. Upload scan gun and have manager post', 'Wednesday', 13
  UNION ALL SELECT 'Assemble the rest of MTO',                                'Wednesday', 14

  -- ── Thursday ──────────────────────────────────────────────────
  UNION ALL SELECT 'Finish up MTO (assembly, etc.)',                          'Thursday', 1
  UNION ALL SELECT 'By the end of the day all MTO should be on the showroom, nothing in F9 for stock', 'Thursday', 2
  UNION ALL SELECT 'Vacuum F1, F2 and F3',                                    'Thursday', 3

  -- ── Friday ────────────────────────────────────────────────────
  UNION ALL SELECT 'Touch up and stock bathrooms and break room',             'Friday', 1
  UNION ALL SELECT 'Vacuum F4, F5 and F6',                                    'Friday', 2
  UNION ALL SELECT 'Blow off parking lot and sweep front walk',               'Friday', 3
  UNION ALL SELECT 'Every other Friday, clean windows inside and out',        'Friday', 4
  UNION ALL SELECT 'After 5 p.m. put out banners by road',                    'Friday', 5

  -- ── Saturday ──────────────────────────────────────────────────
  UNION ALL SELECT 'Pick ups',                                                'Saturday', 1
  UNION ALL SELECT 'Dust entire store including foyer',                       'Saturday', 2
  UNION ALL SELECT 'As you dust, make sure lamps and reclining pieces are plugged in and working properly', 'Saturday', 3
) t
WHERE @client_org IS NOT NULL;
