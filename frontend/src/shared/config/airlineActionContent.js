export const AIRLINE_ACTIONS = {
  book: {
    id: 'book',
    breadcrumbRoot: 'Book',
    breadcrumbDesk: 'Online Desk',
    h1: (name) => `Book ${name} Flights`,
    subtext:
      'Check real-time seating inventory and book your new flight with an agent today.',
    callLabel: 'Call Booking Support',
    faqTitle: (name) => `${name} Travel FAQ`,
    faqIntro:
      'Baggage, change, and cancellation policies for this carrier—plus how our advisors can help.',
    serviceType: 'flights',
  },
  changes: {
    id: 'changes',
    breadcrumbRoot: 'Changes',
    breadcrumbDesk: 'Support Desk',
    h1: (name) => `Call Now to Change Your ${name} Reservation`,
    subtext:
      'Modify travel dates, upgrade cabin seats, or change flight routes instantly.',
    callLabel: 'Call Change Support',
    faqTitle: (name) => `${name} Travel FAQ`,
    faqIntro:
      'Baggage, change, and cancellation policies for this carrier—plus how our advisors can help.',
    serviceType: 'flights',
  },
  cancellation: {
    id: 'cancellation',
    breadcrumbRoot: 'Cancellation',
    breadcrumbDesk: 'Quick Desk',
    h1: (name) => `Cancel ${name} Flight Bookings`,
    subtext:
      'Need to void a ticket or cancel your itinerary? Speak with an agent for immediate help.',
    callLabel: 'Call Cancellation Support',
    faqTitle: (name) => `${name} Travel FAQ`,
    faqIntro:
      'Baggage, change, and cancellation policies for this carrier—plus how our advisors can help.',
    serviceType: 'flights',
  },
};
