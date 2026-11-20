import {ipAddress,geolocation,waitUntil} from '@vercel/functions';
import {createVercelHandler} from '../server/vercel.js';

// Native Request/Response handler: every method reaches the same existing business logic.
export default {fetch:createVercelHandler({clientIp:ipAddress,country:request=>geolocation(request).country,waitUntil})};
