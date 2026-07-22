import supabase from '../../integrations/supabase/supabase.client.mjs';

export const authRepository = {
  findUserByEmail: async (email) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  createUser: async (userData) => {
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: userData.email.trim(),
        password: userData.password,
        first_name: userData.firstName || null,
        last_name: userData.lastName || null,
        phone: userData.phone || null,
        date_of_birth: userData.dateOfBirth || null,
        gender: userData.gender || null,
        nationality: userData.nationality || null,
        passport_number: userData.passportNumber || null,
        passport_expiry: userData.passportExpiry || null,
        role: userData.role || 'user',
        is_active: true
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  findUserById: async (id) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }
};

export default authRepository;
