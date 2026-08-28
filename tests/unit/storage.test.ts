import { storage } from '../../server/storage';

describe('Storage client operations', () => {
  it('should create and retrieve a client', async () => {
    const clientData = {
      brokerId: 'broker-1',
      firstName: 'Juan',
      lastName: 'Perez',
      email: 'juan@example.com',
    } as any;
    const client = await storage.createClient(clientData);
    expect(client.id).toBeDefined();
    const fetched = await storage.getClient(client.id);
    expect(fetched).toMatchObject(clientData);
  });
});
