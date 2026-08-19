import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';

const testMemoryStore = new Map();

export const enquiryRepository = {
  saveEnquiry: async (enquiryData) => {
    const clientRequestId = (enquiryData.clientRequestId || enquiryData.client_request_id || '').trim() || null;

    const payload = {
      client_request_id: clientRequestId,
      service_type: (enquiryData.serviceType || 'flights').trim(),
      status: 'NEW',
      name: (enquiryData.name || '').trim(),
      email: (enquiryData.email || '').trim(),
      phone: (enquiryData.phone || '').trim() || null,
      origin: (enquiryData.origin || '').trim() || null,
      destination: (enquiryData.destination || '').trim() || null,
      trip_type: (enquiryData.tripType || enquiryData.trip_type || '').trim() || null,
      travel_date: (enquiryData.travelDate || enquiryData.travel_date || '').trim() || null,
      return_date: (enquiryData.returnDate || enquiryData.return_date || '').trim() || null,
      passengers: String(enquiryData.passengers || '1'),
      cabin_class: (enquiryData.cabinClass || enquiryData.cabin || enquiryData.cabin_class || '').trim() || null,
      notes: (enquiryData.notes || '').trim() || null,
      sms_opt_in: Boolean(enquiryData.smsOptIn || enquiryData.sms_opt_in),
      preferred_destination: (enquiryData.preferredDestination || '').trim() || null,
      flexible_dates: (enquiryData.flexibleDates || '').trim() || null,
      source: (enquiryData.source || 'website').trim(),
      utm_source: (enquiryData.utm_source || enquiryData.utmSource || '').trim() || null,
      utm_medium: (enquiryData.utm_medium || enquiryData.utmMedium || '').trim() || null,
      utm_campaign: (enquiryData.utm_campaign || enquiryData.utmCampaign || '').trim() || null,
      utm_content: (enquiryData.utm_content || enquiryData.utmContent || '').trim() || null,
      gclid: (enquiryData.gclid || '').trim() || null,
      gbraid: (enquiryData.gbraid || '').trim() || null,
      wbraid: (enquiryData.wbraid || '').trim() || null,
      email_status: 'PENDING'
    };

    // Idempotency check by client_request_id if supplied
    if (clientRequestId) {
      try {
        const { data: existing } = await supabase
          .from('inquiries')
          .select()
          .eq('client_request_id', clientRequestId)
          .maybeSingle();

        if (existing?.id) {
          logger.info(`[EnquiryRepo] Found existing inquiry for client_request_id ${clientRequestId}: ${existing.id}`);
          return { ...existing, persisted: true };
        }
      } catch (idempErr) {
        logger.warn('[EnquiryRepo] Idempotency lookup check failed:', idempErr.message);
      }
    }

    try {
      const { data, error } = await supabase
        .from('inquiries')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('[EnquiryRepo] Supabase insert failed:', { code: error.code, message: error.message });

        // Memory fallback ONLY for explicit unit test mode with ALLOW_TEST_MEMORY_FALLBACK=true
        if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_MEMORY_FALLBACK === 'true') {
          const testId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const testRecord = { id: testId, ...payload, persisted: true, created_at: new Date().toISOString() };
          testMemoryStore.set(testId, testRecord);
          return testRecord;
        }

        const err = new Error(`Unable to persist inquiry: ${error.message}`);
        err.code = 'INQUIRY_PERSISTENCE_FAILED';
        err.statusCode = 500;
        throw err;
      }

      return { ...data, persisted: true };
    } catch (err) {
      if (err.code === 'INQUIRY_PERSISTENCE_FAILED') throw err;

      logger.error('[EnquiryRepo] Exception during Supabase insert:', err.message);

      if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_MEMORY_FALLBACK === 'true') {
        const testId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const testRecord = { id: testId, ...payload, persisted: true, created_at: new Date().toISOString() };
        testMemoryStore.set(testId, testRecord);
        return testRecord;
      }

      const dbErr = new Error(`Unable to persist inquiry: ${err.message}`);
      dbErr.code = 'INQUIRY_PERSISTENCE_FAILED';
      dbErr.statusCode = 500;
      throw dbErr;
    }
  },

  updateEmailStatus: async (leadId, { status, provider, messageId, error }) => {
    if (!leadId) return;
    try {
      await supabase
        .from('inquiries')
        .update({
          email_status: status,
          email_provider: provider || null,
          email_message_id: messageId || null,
          email_error: error || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
    } catch (err) {
      logger.warn(`[EnquiryRepo] Failed to update email status for lead ${leadId}:`, err.message);
    }
  }
};

export default enquiryRepository;
