import supabase from '../../integrations/supabase/supabase.client.mjs';

export const travellerRepository = {
  findTravellersByBookingId: async (bookingId) => {
    const { data, error } = await supabase
      .from('travellers')
      .select('*')
      .eq('booking_id', bookingId);

    if (error) throw new Error(error.message);
    return data;
  },

  createTravellers: async (bookingId, travellersList) => {
    const rows = travellersList.map((t) => ({
      booking_id: bookingId,
      role: (t.role || 'adult').toLowerCase(),
      title: t.title || null,
      first_name: t.firstName || '',
      middle_name: t.middleName || null,
      last_name: t.lastName || '',
      date_of_birth: t.dateOfBirth || null,
      gender: t.gender || null,
      nationality: t.nationality || null,
      passport_number: t.passportNumber || null,
      passport_expiry: t.passportExpiry || null,
    }));

    const { data, error } = await supabase
      .from('travellers')
      .insert(rows)
      .select();

    if (error) throw new Error(error.message);
    return data;
  }
};

export default travellerRepository;
