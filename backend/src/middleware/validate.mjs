export const validate = (schema) => {
  return (req, res, next) => {
    // If we had a schema validation library like Joi or Zod, we would run it here.
    // For this refactoring, we'll keep the current approach (simple manual checks or custom helper functions).
    // The controller or validate middleware will execute it.
    if (typeof schema === 'function') {
      const error = schema(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: error }
        });
      }
    }
    next();
  };
};

export default validate;
