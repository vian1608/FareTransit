import supabase from '../../integrations/supabase/supabase.client.mjs';

export const abandonedBookingRepository = {
  findSession: async (sessionKey) => {
    if (!sessionKey) return null;
    const { data, error } = await supabase
      .from('abandoned_bookings')
      .select('id')
      .eq('session_key', sessionKey)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  updateSession: async (sessionKey, fields) => {
    const { data, error } = await supabase
      .from('abandoned_bookings')
      .update({
        selected_flight: fields.selectedFlight || null,
        return_flight: fields.returnFlight || null,
        traveller_info: fields.travellerInfo || null,
        contact_info: fields.contactInfo || null,
        special_requests: fields.specialRequests || null,
        current_step: fields.currentStep || null,
        updated_at: new Date().toISOString()
      })
      .eq('session_key', sessionKey)
      .select();

    if (error) throw new Error(error.message);
    return data;
  },

  createSession: async (fields) => {
    const { data, error } = await supabase
      .from('abandoned_bookings')
      .insert({
        session_key: fields.sessionKey || null,
        selected_flight: fields.selectedFlight || null,
        return_flight: fields.returnFlight || null,
        traveller_info: fields.travellerInfo || null,
        contact_info: fields.contactInfo || null,
        special_requests: fields.specialRequests || null,
        current_step: fields.currentStep || null,
      })
      .select();

    if (error) throw new Error(error.message);
    return data;
  },

  deleteSession: async (sessionKey) => {
    const { data, error } = await supabase
      .from('abandoned_bookings')
      .delete()
      .eq('session_key', sessionKey);

    if (error) throw new Error(error.message);
    return data;
  }
};

export default abandonedBookingRepository;
