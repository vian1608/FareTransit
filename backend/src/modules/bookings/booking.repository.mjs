import supabase from '../../integrations/supabase/supabase.client.mjs';

export const bookingRepository = {
  createBookingRecord: async (dbRow) => {
    const { data, error } = await supabase
      .from('bookings')
      .insert(dbRow)
      .select()
      .single();

    if (error) throw new Error(`Booking record insert failed: ${error.message}`);
    return data;
  },

  insertTravellers: async (travellerRows) => {
    const { data, error } = await supabase
      .from('travellers')
      .insert(travellerRows)
      .select();

    if (error) throw new Error(`Travellers records insert failed: ${error.message}`);
    return data;
  },

  insertContact: async (contactRow) => {
    const { data, error } = await supabase
      .from('contacts')
      .insert(contactRow)
      .select();

    if (error) throw new Error(`Contact record insert failed: ${error.message}`);
    return data;
  },

  insertFlights: async (flightRows) => {
    const { data, error } = await supabase
      .from('flights')
      .insert(flightRows)
      .select();

    if (error) throw new Error(`Flights records insert failed: ${error.message}`);
    return data;
  },

  insertPayment: async (paymentRow) => {
    const { data, error } = await supabase
      .from('payments')
      .insert(paymentRow)
      .select();

    if (error) throw new Error(`Payment record insert failed: ${error.message}`);
    return data;
  },

  findBookingByCode: async (code) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('confirmation_code', code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  findBookingById: async (id) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  findBookingsByEmail: async (email) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  searchBookings: async (q) => {
    // Exact confirmation code matches
    const { data: byCode } = await supabase
      .from('bookings')
      .select('*')
      .eq('confirmation_code', q.toUpperCase());

    if (byCode && byCode.length > 0) return byCode;

    // Email partial matches
    const { data: byEmail } = await supabase
      .from('bookings')
      .select('*')
      .ilike('email', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (byEmail && byEmail.length > 0) return byEmail;

    // Passenger name partial matches
    const { data: byName } = await supabase
      .from('bookings')
      .select('*')
      .ilike('passenger_name', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    return byName || [];
  },

  findAllBookings: async (filters = {}) => {
    let query = supabase.from('bookings').select('*');

    if (filters.status) {
      let s = filters.status.toUpperCase();
      if (s === 'CONFIRMED' || s === 'COMPLETED') s = 'DONE';
      query = query.eq('status', s);
    }
    if (filters.email) {
      query = query.ilike('email', `%${filters.email}%`);
    }
    if (filters.reference) {
      query = query.ilike('confirmation_code', `%${filters.reference}%`);
    }
    if (filters.name) {
      query = query.ilike('passenger_name', `%${filters.name}%`);
    }
    if (filters.date) {
      const start = `${filters.date}T00:00:00Z`;
      const end   = `${filters.date}T23:59:59Z`;
      query = query.gte('created_at', start).lte('created_at', end);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  updateStatus: async (id, updateFields) => {
    const { data, error } = await supabase
      .from('bookings')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  getStats: async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('status, payment_status, total_amount');

    if (error) throw new Error(error.message);
    return data || [];
  },

  getRelations: async (bookingId) => {
    const [travellers, contacts, flights, payments] = await Promise.all([
      supabase.from('travellers').select('*').eq('booking_id', bookingId),
      supabase.from('contacts').select('*').eq('booking_id', bookingId),
      supabase.from('flights').select('*').eq('booking_id', bookingId),
      supabase.from('payments').select('*').eq('booking_id', bookingId),
    ]);

    return {
      travellers: travellers.data || [],
      contacts: contacts.data || [],
      flights: flights.data || [],
      payments: payments.data || []
    };
  }
};

export default bookingRepository;
