import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import routesData from '../../../shared/data/routesData.json';
import FlightRoute from './FlightRoutePage';
import TrainRoute from './TrainRoutePage';

const RouteDispatcher = () => {
  const { slug } = useParams();
  const route = routesData.find((r) => r.slug === slug);

  if (!route) {
    return <Navigate to="/" replace />;
  }

  if (route.type === 'flight') {
    return (
      <FlightRoute
        title={route.title}
        metaTitle={route.metaTitle}
        metaDescription={route.metaDescription}
        originCity={route.originCity}
        destinationCity={route.destinationCity}
        originCode={route.originCode}
        destinationCode={route.destinationCode}
      />
    );
  } else if (route.type === 'train') {
    return (
      <TrainRoute
        title={route.title}
        metaTitle={route.metaTitle}
        metaDescription={route.metaDescription}
        originCity={route.originCity}
        destinationCity={route.destinationCity}
        originCode={route.originCode}
        destinationCode={route.destinationCode}
      />
    );
  }

  return <Navigate to="/" replace />;
};

export default RouteDispatcher;
