import React from 'react';
import { useParams } from 'react-router-dom';
import routesData from '../../../shared/data/routesData.json';
import NotFoundPage from '../../../shared/pages/NotFoundPage';
import FlightRoute from './FlightRoutePage';
import TrainRoute from './TrainRoutePage';

const RouteDispatcher = () => {
  const { slug } = useParams();
  const route = routesData.find((r) => r.slug === slug);

  if (!route) {
    return <NotFoundPage />;
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
  }

  if (route.type === 'train') {
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

  return <NotFoundPage />;
};

export default RouteDispatcher;
