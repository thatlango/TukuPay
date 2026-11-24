import type { FastifyInstance } from 'fastify';
import { identifyService,requireProductAccess,requireScopes } from '../auth/service-auth.js';
import { db } from '../db/pool.js';
import { TukuPayError } from '../errors.js';

export async function registerFinancialEventRoutes(app:FastifyInstance):Promise<void>{
  app.get('/v1/products/:product/financial-events',{preHandler:requireScopes('events:read')},async request=>{
    const {product}=request.params as {product:string};
    const code=product.trim().toLowerCase();
    requireProductAccess(request,code);
    const r=await db.query(
      `SELECT e.id,e.sequence::text,e.schema_version,e.kind,e.transaction_id,e.product_code,e.status,
         e.currency,e.amount_minor::text,e.occurred_at FROM financial_events e
       WHERE e.product_code=$1 AND NOT EXISTS(SELECT 1 FROM financial_event_acknowledgements a WHERE a.event_id=e.id)
       ORDER BY e.sequence LIMIT 100`,[code]);
    return {delivery:'at-least-once',events:r.rows};
  });
  app.post('/v1/products/:product/financial-events/:id/ack',{preHandler:requireScopes('events:ack')},async request=>{
    const {product,id}=request.params as {product:string;id:string};
    const code=product.trim().toLowerCase();
    requireProductAccess(request,code);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new TukuPayError('Invalid event ID','VALIDATION_ERROR',400);
    const actor=identifyService(request)?.service;
    if(!actor)throw new TukuPayError('Authentication required','UNAUTHORIZED',401);
    const found=await db.query('SELECT id FROM financial_events WHERE id=$1 AND product_code=$2',[id,code]);
    if(!found.rowCount)throw new TukuPayError('Event not found','NOT_FOUND',404);
    await db.query('INSERT INTO financial_event_acknowledgements(event_id,actor) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,actor]);
    return {id,acknowledged:true};
  });
}
