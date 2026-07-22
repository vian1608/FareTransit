import supabase from '../../integrations/supabase/supabase.client.mjs';

export const customerRepository = {
  findCustomerByEmail: async (email) => {
    // A customer can be fetched from the users table or contacts table.
    // Let's check users table first.
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return user;
  },

  findCustomerBookings: async (email) => {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return bookings;
  }
};

export default customerRepository;
