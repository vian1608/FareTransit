import jwt from 'jsonwebtoken';
import env from '../../config/env.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import bookingCurrentView from '../bookings/booking-current-view.mjs';
import adminBookingReadRepository from './admin-booking-read.repository.mjs';
import adminCurrentItineraryRepository from './admin-current-itinerary.repository.mjs';
import ga4Service from '../../integrations/ga4/ga4.service.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import bcrypt from 'bcryptjs';
import backofficeStaffService from '../backoffice/backoffice.service.mjs';

const loadCanonicalDetail = async id => {
  const detail = await adminBookingReadRepository.getDetail(id);
  if (!detail?.id) return detail;
  const currentSegments = await adminCurrentItineraryRepository.getByBookingId(detail.id);
  const merged = currentSegments.length > 0 ? { ...detail, itinerary_segments: currentSegments, outbound_segments: currentSegments.filter(segment => segment.journey_direction === 'outbound'), return_segments: currentSegments.filter(segment => segment.journey_direction === 'return') } : detail;
  return bookingCurrentView(merged);
};

export const adminService = {
  login: async (email = '', password = '') => {
    const cleanEmail = (email || '').toLowerCase().trim();
    const targetAdminEmail = (env.adminEmail || 'admin@faretransit.com').toLowerCase().trim();
    if (!cleanEmail || !password) { const err = new Error('Admin email and password are required.'); err.code = 'INVALID_CREDENTIALS'; err.statusCode = 401; throw err; }

    // Only read the legacy ADMIN_PASSWORD for the legacy owner account.
    // Database-backed staff/merchant accounts must remain usable even when the
    // legacy owner credential has not been configured in a deployment yet.
    if (cleanEmail === targetAdminEmail) {
      const expectedPassword = env.adminPassword || 'admin123';
      const isPasswordValid = expectedPassword.startsWith('$2a$') || expectedPassword.startsWith('$2b$') ? await bcrypt.compare(password, expectedPassword) : password === expectedPassword;
      if (!isPasswordValid) { const err = new Error('Invalid email or password.'); err.code = 'INVALID_CREDENTIALS'; err.statusCode = 401; throw err; }
      const token = jwt.sign({ email: cleanEmail, role: 'admin' }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
      return { token, admin: backofficeStaffService.legacyOwnerProfile(cleanEmail) };
    }

    return backofficeStaffService.login(cleanEmail, password);
  },
  getAllBookings: async (filters) => adminBookingReadRepository.list(filters),
  getBookingDetails: loadCanonicalDetail,
  getCompleteBookingById: loadCanonicalDetail,
  updateBooking: async (id, updateFields) => bookingRepository.updateStatus(id, updateFields),
  getDashboardStats: async () => bookingRepository.getStats(),
  getAnalytics: async (days = 30) => {
    const [realtime, summary] = await Promise.all([ga4Service.getRealtimeActiveUsers(), ga4Service.getAnalyticsSummary(days)]);
    return { realtimeActiveUsers: realtime.activeUsers || 0, liveStatus: realtime.liveStatus, notice: summary.notice || realtime.notice || null, totalVisitors: summary.totalVisitors || 0, totalSessions: summary.totalSessions || 0, pageViews: summary.pageViews || 0, engagementRate: summary.engagementRate || 0, dailyTrend: summary.dailyTrend || [], trafficSources: summary.trafficSources || [], deviceCategories: summary.deviceCategories || [] };
  },
  getAbandonedBookings: async () => {
    const { data, error } = await supabase.from('abandoned_bookings').select('id,session_key,traveller_info,contact_info,current_step,updated_at').order('updated_at', { ascending: false }).limit(100);
    if (error) { console.warn('Abandoned bookings query warning:', error.message); return []; }
    return data || [];
  }
};

export default adminService;
