-- ═══════════════════════════════════════════════════════════════
-- 013_journey_segments_structure.sql
-- Multi-Connecting Flight Journeys & Segment Sequence Schema
-- ═══════════════════════════════════════════════════════════════

-- 1. Add expanded journey & connecting flight columns to booking_itinerary_segments
ALTER TABLE booking_itinerary_segments
ADD COLUMN IF NOT EXISTS journey_direction VARCHAR(20) DEFAULT 'outbound',
ADD COLUMN IF NOT EXISTS segment_sequence INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS operating_carrier VARCHAR(100),
ADD COLUMN IF NOT EXISTS arrival_next_day BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS aircraft VARCHAR(50),
ADD COLUMN IF NOT EXISTS layover_duration VARCHAR(30);

-- 2. Populate new columns safely from existing data for backward compatibility
UPDATE booking_itinerary_segments
SET journey_direction = COALESCE(direction, 'outbound'),
    segment_sequence = COALESCE(segment_order, 1)
WHERE journey_direction IS NULL OR segment_sequence IS NULL;

-- 3. Create index for fast journey lookup by booking_id, journey_direction, and segment_sequence
CREATE INDEX IF NOT EXISTS idx_segments_journey_sequence 
ON booking_itinerary_segments(booking_id, journey_direction, segment_sequence);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
