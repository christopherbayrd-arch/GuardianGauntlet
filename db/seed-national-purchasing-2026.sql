-- ============================================================
--  Guardian Gauntlet — game seed: National Purchasing Meeting 2026
--  (converted from the Kahoot import spreadsheet, 14 questions)
--
--  How to run: Neon Console → SQL Editor → paste this whole file
--  → Run. Then refresh the question console — the game appears
--  with code NPM26, in Setup mode, ready to open.
--
--  Safe to run more than once (it won't duplicate anything).
-- ============================================================

insert into games (code, title, status)
values ('NPM26', 'National Purchasing Meeting 2026', 'draft')
on conflict (code) do nothing;

insert into questions (game_id, position, prompt, options, correct_index)
select g.id, v.position, v.prompt, v.options, v.correct_index
from games g,
     (values
       (0,  'What does DSCSA stand for?',
            jsonb_build_array('Drug Safety Compliance & Shipping Act', 'Drug Supply Chain Security Act', 'Daily SureCost Scanning Assignment', 'Don''t Send Cardinal Anything'), 1),
       (1,  'In SureCost, what does "drug is obsolete" mean?',
            jsonb_build_array('The manufacturer has discontinued the NDC', 'The drug expired on your shelf', 'The warehouse is out of stock', 'It''s older than your pharmacist'), 0),
       (2,  'What does AWP stand for?',
            jsonb_build_array('Actual Warehouse Pricing', 'Automated Weekly Purchasing', 'Average Wholesale Price', 'Ain''t What''s Paid'), 2),
       (3,  'AWP is typically calculated as WAC plus...',
            jsonb_build_array('10%', '20%', '35%', '50%'), 1),
       (4,  'Which pricing benchmark is built from actual pharmacy invoice data?',
            jsonb_build_array('AWP', 'WAC', 'MAC', 'NADAC'), 3),
       (5,  'Even when segregated, oral solid OTCs must still be counted in...',
            jsonb_build_array('Q1', 'Q2', 'Q4', 'Never - segregation exempts them'), 2),
       (6,  'In SureCost, "minimum savings not met" at order review means...',
            jsonb_build_array('Switching NDCs wouldn''t hit your set savings threshold', 'Order total is below the vendor minimum', 'Your compliance % fell under target', 'Contract pricing failed to load'), 0),
       (7,  'The 11-digit billing NDC follows which segment format?',
            jsonb_build_array('4-4-3', '5-3-3', '5-4-2', '5-5-1'), 2),
       (8,  'How many digits are in a Medi-Span GPI?',
            jsonb_build_array('10', '11', '12', '14'), 3),
       (9,  'MHA is what type of organization?',
            jsonb_build_array('Wholesaler', 'GPO (group purchasing organization)', 'PBM', 'Reverse distributor'), 1),
       (10, 'A generic must carry which Orange Book rating to substitute freely for the brand?',
            jsonb_build_array('AB', 'BD', 'BP', 'BX'), 0),
       (11, 'The first generic to challenge a brand''s patent earns how long as the ONLY generic on the market?',
            jsonb_build_array('30 days', '90 days', '180 days', '1 year'), 2),
       (12, 'Per patent settlements, generic Eliquis can''t launch in the US until...',
            jsonb_build_array('2026', '2028', '2030', '2032'), 1),
       (13, 'The DSCSA 2D barcode scanned at receiving contains the NDC/GTIN, serial number, expiration date, and...',
            jsonb_build_array('Lot number', 'Wholesaler DEA number', 'AWP', 'Manufacturer address'), 0)
     ) as v(position, prompt, options, correct_index)
where g.code = 'NPM26'
  and not exists (select 1 from questions q where q.game_id = g.id);
