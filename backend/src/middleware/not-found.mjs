export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested path '${req.originalUrl}' was not found.`
    }
  });
};

export default notFound;
