import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseGdsItineraryText, parseStructuredJsonItinerary, buildGdsStyleReferenceLines, CHATGPT_PROMPT_TEMPLATE } from '../src/shared/utils/gds-itinerary-parser.mjs';

describe('Step 2 — Itinerary Import Parser Test Suite', () => {

  it('TEST 1 — Prompt Template contains required rules & JSON structure', () => {
    assert.ok(CHATGPT_PROMPT_TEMPLATE.includes('You are an expert airline reservation and GDS itinerary formatter'));
    assert.ok(CHATGPT_PROMPT_TEMPLATE.includes('20. Return valid JSON only'));
    assert.ok(CHATGPT_PROMPT_TEMPLATE.includes('gdsStyleDisplay'));
  });

  it('TEST 2 — Structured ChatGPT JSON Parsing (Round Trip with Connection)', () => {
    const jsonInput = `{
      "tripType": "round_trip",
      "source": "google_flights",
      "currency": "USD",
      "displayedPrice": "850.00",
      "passengerCount": 1,
      "journeys": [
        {
          "journeyType": "outbound",
          "segments": [
            {
              "segmentOrder": 1,
              "marketingAirlineName": "Delta Air Lines",
              "marketingAirlineCode": "DL",
              "flightNumber": "106",
              "departureAirport": "JFK",
              "departureCity": "New York",
              "departureDate": "2026-09-15",
              "departureTime": "19:30",
              "arrivalAirport": "LHR",
              "arrivalCity": "London",
              "arrivalDate": "2026-09-16",
              "arrivalTime": "07:45",
              "cabin": "Economy",
              "bookingClass": "Y"
            }
          ]
        },
        {
          "journeyType": "return",
          "segments": [
            {
              "segmentOrder": 1,
              "marketingAirlineName": "Delta Air Lines",
              "marketingAirlineCode": "DL",
              "flightNumber": "107",
              "departureAirport": "LHR",
              "departureCity": "London",
              "departureDate": "2026-09-25",
              "departureTime": "12:00",
              "arrivalAirport": "JFK",
              "arrivalCity": "New York",
              "arrivalDate": "2026-09-25",
              "arrivalTime": "15:30",
              "cabin": "Economy",
              "bookingClass": "Y"
            }
          ]
        }
      ],
      "gdsStyleDisplay": [
        "01 DL 106 Y 15SEP JFK LHR 1930 0745 NN1",
        "02 DL 107 Y 25SEP LHR JFK 1200 1530 NN1"
      ],
      "warnings": []
    }`;

    const res = parseGdsItineraryText(jsonInput);
    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assert.strictEqual(res.data.tripType, 'round_trip');
    assert.strictEqual(res.data.journeys.length, 2);
    assert.strictEqual(res.data.journeys[0].segments[0].origin_airport, 'JFK');
    assert.strictEqual(res.data.journeys[0].segments[0].destination_airport, 'LHR');
    assert.strictEqual(res.data.gdsStyleDisplay.length, 2);
  });

  it('TEST 3 — Compact GDS Line Parsing (SS lines)', () => {
    const textInput = `TRIP: ROUND_TRIP
PASSENGERS: 1
CABIN: ECONOMY

OUTBOUND
SS DL 106 Y 15SEP2026 JFK LHR 1930 0745

RETURN
SS DL 107 Y 25SEP2026 LHR JFK 1200 1530`;

    const res = parseGdsItineraryText(textInput);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.tripType, 'round_trip');
    assert.strictEqual(res.data.journeys.length, 2);
    assert.strictEqual(res.data.journeys[0].segments[0].carrier_code, 'DL');
    assert.strictEqual(res.data.journeys[0].segments[0].flight_number, '106');
    assert.ok(res.data.gdsStyleDisplay.length > 0);
  });

  it('TEST 4 — GDS Reference Line Generator', () => {
    const segs = [
      {
        carrier_code: 'BA',
        flight_number: '178',
        booking_class: 'J',
        departureDate: '2026-10-01',
        origin_airport: 'JFK',
        destination_airport: 'LHR',
        departureTime: '08:00',
        arrivalTime: '20:10'
      }
    ];

    const lines = buildGdsStyleReferenceLines(segs);
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].includes('01 BA 178 J 01OCT JFKLHR 0800 2010 NN1'));
  });

});
