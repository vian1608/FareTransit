import axios from 'axios';

export const getAddressAutocomplete = async (req, res) => {
  const query = req.query.q || '';
  const trimmed = String(query).trim();

  if (!trimmed || trimmed.length < 3) {
    return res.json({ success: true, suggestions: [] });
  }

  try {
    const response = await axios.get('https://photon.komoot.io/api/', {
      params: {
        q: trimmed,
        limit: 5,
        lang: 'en',
      },
      timeout: 3500,
    });

    const features = response.data?.features || [];

    const suggestions = features.map((feat) => {
      const props = feat.properties || {};
      const houseNumber = props.housenumber || '';
      const street = props.street || props.name || '';
      
      const line1Parts = [houseNumber, street].filter(Boolean);
      const addressLine1 = line1Parts.length > 0 ? line1Parts.join(' ') : props.name || trimmed;

      const city = props.city || props.town || props.village || props.county || '';
      const state = props.state || props.state_code || '';
      const postalCode = props.postcode || '';
      const country = props.country || '';

      const formattedParts = [addressLine1, city, state, postalCode, country].filter(Boolean);
      const formatted = formattedParts.join(', ');

      return {
        addressLine1,
        addressLine2: '',
        city,
        state,
        postalCode,
        country,
        formatted,
      };
    });

    return res.json({
      success: true,
      suggestions,
    });
  } catch (err) {
    console.error('[Address Autocomplete Error]:', err.message);
    return res.status(503).json({
      success: false,
      suggestions: [],
      error: 'Address suggestions are temporarily unavailable. Please enter your address manually.',
    });
  }
};

export default { getAddressAutocomplete };
