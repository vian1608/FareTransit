-- Canonical rental-company logos live in car_rental_companies, not on admin forms.
-- Special:Redirect/file with a width requests a rendered thumbnail for SVG sources,
-- which is friendlier to browsers and email clients than storing raw SVG markup.

UPDATE public.car_rental_companies
SET logo_url = CASE code
  WHEN 'ALAMO' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Alamo_Rent_a_Car_(logo).svg?width=320'
  WHEN 'AVIS' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/AVIS_logo_2012.svg?width=320'
  WHEN 'BUDGET' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Budget_logo.svg?width=320'
  WHEN 'DOLLAR' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Dollar_Car_Rental_Logo.gif'
  WHEN 'ENTERPRISE' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Enterprise_Rent-A-Car_Logo.svg?width=320'
  WHEN 'HERTZ' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Hertz_Car_Rental_logo.svg?width=320'
  WHEN 'NATIONAL' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/National-Car-Rental-Logo.svg?width=320'
  WHEN 'SIXT' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sixt_Logo_2023.svg?width=320'
  WHEN 'THRIFTY' THEN 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Thrifty_Car_Rental_logo.svg?width=320'
  ELSE logo_url
END,
updated_at = NOW()
WHERE code IN ('ALAMO','AVIS','BUDGET','DOLLAR','ENTERPRISE','HERTZ','NATIONAL','SIXT','THRIFTY');

-- Backfill reservations only when touching the row will not trip chronology
-- guards on pre-existing legacy data. Authorization composition also falls back
-- to the canonical company row, so legacy invalid-date records still get logos.
UPDATE public.car_reservations AS car
SET rental_company_logo_url = company.logo_url,
    updated_at = NOW()
FROM public.car_rental_companies AS company
WHERE car.rental_company_id = company.id
  AND company.logo_url IS NOT NULL
  AND car.rental_company_logo_url IS DISTINCT FROM company.logo_url
  AND (car.pickup_at IS NULL OR car.dropoff_at IS NULL OR car.dropoff_at > car.pickup_at);
