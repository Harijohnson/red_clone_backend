import { Router, Request, Response, NextFunction } from 'express';
import Route from '../models/Route.model';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const routes = await Route.find({}, 'source destination').lean().exec();
    const citySet = new Set<string>();
    for (const r of routes) {
      citySet.add(r.source);
      citySet.add(r.destination);
    }
    const cities = Array.from(citySet).sort();
    res.json({ cities });
  } catch (err) {
    next(err);
  }
});

export default router;
