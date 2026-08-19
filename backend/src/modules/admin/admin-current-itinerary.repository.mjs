import supabase from '../../integrations/supabase/supabase.client.mjs';

const COLUMNS = [
  'id','booking_id','direction','journey_direction','segment_sequence','segment_order',
  'carrier_name','carrier_code','marketing_carrier_code','flight_number','origin_airport',
  'origin_city','destination_airport','destination_city','departure_date','departure_time',
  'arrival_date','arrival_time','cabin','aircraft','layover_duration','duration','stop_count',
  'trip_type','leg','operating_carrier','arrival_next_day','booking_class','terminal',
  'baggage_allowance','created_at','updated_at'
].join(',');

function normalize(segment = {}, index = 0) {
  const rawDirection = String(segment.journey_direction || segment.direction || segment.leg || 'outbound').toLowerCase();
  const direction = ['return', 'inbound'].includes(rawDirection) ? 'return' : 'outbound';
  return {
    ...segment,
    journey_direction: direction,
    direction,
    segment_sequence: Number(segment.segment_sequence || segment.segment_order || index + 1),
    carrier_name: segment.carrier_name || '',
    carrier_code: segment.carrier_code || segment.marketing_carrier_code || '',
    origin_airport: segment.origin_airport || '',
    destination_airport: segment.destination_airport || '',
    departure_time: segment.departure_time || '',
    arrival_time: segment.arrival_time || '',
    cabin: segment.cabin || 'Economy',
    stop_count: Number(segment.stop_count || 0)
  };
}

export const adminCurrentItineraryRepository = {
  getByBookingId: async bookingId => {
    if (!bookingId) return [];
    const { data, error } = await supabase
      .from('booking_itinerary_segments')
      .select(COLUMNS)
      .eq('booking_id', bookingId)
      .order('segment_order', { ascending: true, nullsFirst: false })
      .order('segment_sequence', { ascending: true, nullsFirst: false });

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('does not exist') || message.includes('schema cache') || message.includes('relation')) return [];
      throw new Error(`Unable to load current itinerary: ${error.message}`);
    }
    return (data || []).map(normalize);
  }
};

export default adminCurrentItineraryRepository;
