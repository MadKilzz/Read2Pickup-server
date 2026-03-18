import { formMiddelware } from '@/middelware';
import { authMiddleware } from '@/middelware/auth';
import { Router } from 'express';

class Route {
  public router: Router = Router();

  protected formMiddelware: typeof formMiddelware = formMiddelware;
  protected authMiddelware: typeof authMiddleware = authMiddleware;
}

export default Route;
