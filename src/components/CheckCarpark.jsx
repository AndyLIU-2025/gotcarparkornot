import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import mapping from '../data/carparkDetailsWithLatLng.json';
import { Container, Alert } from 'react-bootstrap';
import SearchForm from './SearchForm';
import UserRoute from './UserRoute';
import CarparkResultCard from './CarparkResultCard';
import './CheckCarpark.css';

const baseURL = 'https://api.data.gov.sg/v1/transport/carpark-availability';

function CheckCarpark() {
  const [location, setLocation] = useState('');
  const [availability, setAvailability] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedCarpark, setSelectedCarpark] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userAddress, setUserAddress] = useState('');
  const [originCoords, setOriginCoords] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [showRoute, setShowRoute] = useState(false);
  const [results, setResults] = useState([]);
  const [slotAvailabilityMap, setSlotAvailabilityMap] = useState({});

  const handleSearch = useCallback(async (e) => {
    const input = e.target.value;
    setLocation(input);

    if (input.trim() === '') {
      setResults([]);
      setSlotAvailabilityMap({});
      return;
    }

    const filtered = mapping.filter(cp =>
      cp.address.toLowerCase().includes(input.toLowerCase())
    );
    setResults(filtered);

    try {
      const response = await axios.get(baseURL);
      const carparkData = response.data.items[0].carpark_data;

      const availabilityMap = {};
      filtered.forEach(cp => {
        const found = carparkData.find(c => c.carpark_number === cp.car_park_no);
        availabilityMap[cp.car_park_no] = (found?.carpark_info[0]?.lots_available ?? 'N/A');
      });

      setSlotAvailabilityMap(availabilityMap);
    } catch (err) {
      console.error('Error fetching availability:', err);
      setSlotAvailabilityMap({});
    }
  }, []);

  const handleSelectSuggestion = (cp) => {
    setLocation(cp.address);
    setResults([]);
    checkAvailability(cp.address);
  };

  const checkAvailability = useCallback(async (manualAddress) => {
    const searchLocation = manualAddress || location;
    const findCarpark = mapping.find(cp =>
      cp.address.toLowerCase().includes(searchLocation.toLowerCase())
    );

    if (!findCarpark || !findCarpark.lat || !findCarpark.lng) {
      setErrorMsg('Location not found in mapping.');
      setAvailability(null);
      setSelectedCarpark(null);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(baseURL);
      const carparkData = response.data.items[0].carpark_data;
      const carpark = carparkData.find(cp => cp.carpark_number === findCarpark.car_park_no);

      if (carpark && carpark.carpark_info.length > 0) {
        setAvailability(carpark.carpark_info[0].lots_available);
        setSelectedCarpark(findCarpark);
        setErrorMsg('');
      } else {
        setErrorMsg('No availability data for this carpark.');
        setAvailability(null);
        setSelectedCarpark(null);
      }
    } catch (err) {
      setErrorMsg('Failed to fetch data.');
      setAvailability(null);
      setSelectedCarpark(null);
    } finally {
      setLoading(false);
    }
  }, [location]);

  const geocodeAddress = async (address) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    const response = await axios.get(url);
    if (response.data && response.data.length > 0) {
      const { lat, lon } = response.data[0];
      return [parseFloat(lat), parseFloat(lon)];
    } else {
      throw new Error('Address not found');
    }
  };

  const fetchRoute = async (start, end) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    const response = await axios.get(url);
    if (response.data.routes.length > 0) {
      return response.data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
    }
    return [];
  };

  const handleRouteClick = useCallback(async () => {
    if (!selectedCarpark || !selectedCarpark.lat || !selectedCarpark.lng) {
      setErrorMsg('Please check carpark availability first.');
      return;
    }

    try {
      setLoading(true);
      let origin;

      if (!userAddress.trim()) {
        origin = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve([position.coords.latitude, position.coords.longitude]),
            (error) => {
              console.error('Geolocation error:', error);
              reject(new Error('Failed to get current location. Please allow location access.'));
            }
          );
        });
      } else {
        origin = await geocodeAddress(userAddress);
      }

      const destination = [selectedCarpark.lat, selectedCarpark.lng];
      const route = await fetchRoute(origin, destination);

      setOriginCoords(origin);
      setRouteCoords(route);
      setShowRoute(true);
      setErrorMsg('');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to calculate route. Please check your address or location access.');
      setShowRoute(false);
    } finally {
      setLoading(false);
    }
  }, [selectedCarpark, userAddress]);

  // 🔁 Auto-update route when userAddress changes
  useEffect(() => {
    if (userAddress.trim() && selectedCarpark) {
      handleRouteClick();
    }
  }, [userAddress, selectedCarpark, handleRouteClick]);

  return (
    <div className="check-carpark-wrapper">
      <Container className="check-carpark-container">
        <div className="text-center">
          <span className="display-1">🚗</span>
          <h1 className="mb-4">GOT CARPARK OR NOT?</h1>
        </div>

        <SearchForm
          location={location}
          setLocation={setLocation}
          onCheck={checkAvailability}
          loading={loading}
          onSearchChange={handleSearch}
          userAddress={userAddress}
          setUserAddress={setUserAddress}
          onRoute={handleRouteClick}
        />

        {results.length > 0 && (
          <div className="suggestion-list mb-3">
            <strong>possible address：</strong>
            <ul className="list-unstyled mb-0 suggestion-list-ul">
              {results.map(cp => (
                <li
                  key={cp.car_park_no}
                  onClick={() => handleSelectSuggestion(cp)}
                  className="suggestion-item"
                >
                  <span>{cp.address}</span>
                  <span className="text-success fw-bold">
                    {slotAvailabilityMap[cp.car_park_no] ?? '--'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <UserRoute
          userAddress={userAddress}
          setUserAddress={setUserAddress}
          handleRouteClick={handleRouteClick}
          selectedCarpark={selectedCarpark}
          loading={loading}
        />

        {errorMsg && <Alert variant="danger">{errorMsg}</Alert>}

        {availability !== null && selectedCarpark && (
          <CarparkResultCard
            availability={availability}
            carpark={selectedCarpark}
            origin={showRoute ? originCoords : null}
            routeCoords={showRoute ? routeCoords : []}
          />
        )}
      </Container>
    </div>
  );
}

export default CheckCarpark;
