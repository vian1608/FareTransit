# Manual payment storage

FareTransit uses masked manual payment metadata for internal recordkeeping.

Stored fields may include cardholder name, card brand, last four digits, expiration month/year, billing metadata, authorization status, amount, notes, and transaction references.

The application does not accept or store a full card number, card security code, track data, or PIN in Supabase. A manual payment record is not a chargeable payment credential; actual payment processing must occur through an approved external payment channel.

Release verification requires the manual-payment regression suite, production parity gate, frontend production build, and preview deployment to pass before promotion.
