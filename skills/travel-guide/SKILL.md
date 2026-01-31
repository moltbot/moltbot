---
name: travel-guide
description: "Worldwide travel assistant: find hotels, transportation, attractions, restaurants, cafes, pubs, clubs, and get directions anywhere in the world."
homepage: https://github.com/openclaw/openclaw
metadata:
  openclaw:
    emoji: "🌍"
    requires:
      bins:
        - curl
        - jq
---

# 🌍 Travel Guide

Your personal worldwide travel assistant. Find hotels, transportation, attractions, and dining options anywhere in the world using free APIs.

## Quick Reference

| Feature     | Command                               |
| ----------- | ------------------------------------- |
| Hotels      | Search hotels/hostels nearby          |
| Transport   | Find airports, bus/train stations     |
| Attractions | Museums, landmarks, parks, beaches    |
| Dining      | Restaurants, cafes, bars, pubs, clubs |
| Directions  | Walking/driving routes between places |

---

## 1. 📍 Location Lookup (Start Here)

First, get coordinates for any city/place:

```bash
curl -s "https://nominatim.openstreetmap.org/search?q=Paris,France&format=json&limit=1" \
  -H "User-Agent: OpenClaw-TravelGuide/1.0" | jq '.[0] | {lat, lon, display_name}'
```

Example output:

```json
{ "lat": "48.8588897", "lon": "2.3200410", "display_name": "Paris, Île-de-France, France" }
```

---

## 2. 🏨 Find Hotels & Hostels

Search for accommodation near any location:

```bash
# Hotels near Paris (radius in meters)
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["tourism"="hotel"](around:5000,48.8589,2.3200);
    node["tourism"="hostel"](around:5000,48.8589,2.3200);
    node["tourism"="guest_house"](around:5000,48.8589,2.3200);
  );
  out body 20;' | jq '.elements[] | {name: .tags.name, type: .tags.tourism, stars: .tags.stars, phone: .tags.phone, website: .tags.website, address: .tags["addr:street"]}'
```

**Parameters:**

- Replace `48.8589,2.3200` with lat,lon from step 1
- Adjust `5000` for search radius in meters
- Change `20` for more/fewer results

---

## 3. 🚌 Find Transportation

### Airports

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["aeroway"="aerodrome"](around:50000,48.8589,2.3200);
    way["aeroway"="aerodrome"](around:50000,48.8589,2.3200);
  );
  out body 10;' | jq '.elements[] | {name: .tags.name, iata: .tags.iata, icao: .tags.icao, type: .tags.aeroway}'
```

### Railway Stations

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["railway"="station"](around:10000,48.8589,2.3200);
  );
  out body 15;' | jq '.elements[] | {name: .tags.name, operator: .tags.operator}'
```

### Bus Stations

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["amenity"="bus_station"](around:10000,48.8589,2.3200);
  );
  out body 15;' | jq '.elements[] | {name: .tags.name, operator: .tags.operator}'
```

---

## 4. 🗺️ Find Tourist Attractions

### Museums & Galleries

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["tourism"="museum"](around:5000,48.8589,2.3200);
    node["tourism"="gallery"](around:5000,48.8589,2.3200);
  );
  out body 15;' | jq '.elements[] | {name: .tags.name, type: .tags.tourism, website: .tags.website}'
```

### Landmarks & Monuments

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["historic"="monument"](around:5000,48.8589,2.3200);
    node["tourism"="attraction"](around:5000,48.8589,2.3200);
    node["historic"="castle"](around:5000,48.8589,2.3200);
  );
  out body 15;' | jq '.elements[] | {name: .tags.name, type: (.tags.historic // .tags.tourism), wikipedia: .tags.wikipedia}'
```

### Parks & Nature

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["leisure"="park"](around:5000,48.8589,2.3200);
    way["leisure"="park"](around:5000,48.8589,2.3200);
    node["natural"="beach"](around:10000,48.8589,2.3200);
  );
  out body 10;' | jq '.elements[] | {name: .tags.name, type: (.tags.leisure // .tags.natural)}'
```

---

## 5. 🍽️ Restaurants, Cafes, Bars & Nightlife

### Restaurants

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["amenity"="restaurant"](around:2000,48.8589,2.3200);
  );
  out body 20;' | jq '.elements[] | {name: .tags.name, cuisine: .tags.cuisine, phone: .tags.phone, website: .tags.website}'
```

### Cafes & Coffee Shops

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["amenity"="cafe"](around:2000,48.8589,2.3200);
  );
  out body 15;' | jq '.elements[] | {name: .tags.name, cuisine: .tags.cuisine, wifi: .tags["internet_access"]}'
```

### Bars & Pubs

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["amenity"="bar"](around:2000,48.8589,2.3200);
    node["amenity"="pub"](around:2000,48.8589,2.3200);
  );
  out body 15;' | jq '.elements[] | {name: .tags.name, type: .tags.amenity}'
```

### Nightclubs

```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data '[out:json][timeout:25];
  (
    node["amenity"="nightclub"](around:5000,48.8589,2.3200);
  );
  out body 10;' | jq '.elements[] | {name: .tags.name, website: .tags.website}'
```

---

## 6. 🛤️ Get Directions

Get walking/driving directions between two points.

### Setup (Optional - for detailed routes)

```bash
# Get a free API key from https://openrouteservice.org/dev/#/signup
export OPENROUTE_API_KEY="your-api-key-here"
```

### With API Key

```bash
# Walking directions from Eiffel Tower to Louvre
curl -s "https://api.openrouteservice.org/v2/directions/foot-walking?api_key=$OPENROUTE_API_KEY&start=2.2945,48.8584&end=2.3376,48.8606" | jq '.features[0].properties.summary'
```

### Without API key (Google Maps link)

```bash
echo "https://www.google.com/maps/dir/48.8584,2.2945/48.8606,2.3376"
```

---

## 7. 📖 Get Place Information from Wikipedia

Get description for any famous place:

```bash
curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/Eiffel_Tower" | jq '{title, description, extract_short: .extract[0:500]}'
```

---

## Example Conversation Flow

1. **User:** "I'm traveling to Tokyo, Japan. Find me hotels"
2. **Assistant:** First get coordinates, then search hotels
3. **User:** "What attractions are nearby?"
4. **Assistant:** Search museums, landmarks near those coordinates
5. **User:** "Find good restaurants for dinner"
6. **Assistant:** Search restaurants, filter by cuisine
7. **User:** "How do I get from my hotel to Tokyo Tower?"
8. **Assistant:** Provide directions link or route info

---

## Tips

- **Always start with location lookup** to get accurate coordinates
- **Adjust radius** based on city density (smaller for cities, larger for rural)
- **Combine searches** if user wants multiple types
- **Use Wikipedia** for famous landmarks to provide descriptions
- For **prices/reviews**, mention that user should check booking sites (Booking.com, TripAdvisor, Google Maps)

---

## Supported Worldwide

This skill works for **any location in the world** - just change the coordinates!

Examples:

- New York: `40.7128,-74.0060`
- London: `51.5074,-0.1278`
- Tokyo: `35.6762,139.6503`
- Sydney: `-33.8688,151.2093`
- Dubai: `25.2048,55.2708`
- Rio de Janeiro: `-22.9068,-43.1729`
