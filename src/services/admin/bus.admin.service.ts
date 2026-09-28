import { Types } from 'mongoose';
import Bus from '../../models/Bus.model';
import User from '../../models/User.model';
import type { IUserDocument } from '../../types/user.types';
import type {
  IAdminBusItem,
  IAdminBusListResponse,
  ICreateBusRequest,
  IUpdateBusRequest,
} from '../../types/admin.types';

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function toBusItem(b: InstanceType<typeof Bus> & { operatedBy: IUserDocument }): IAdminBusItem {
  const op = b.operatedBy as IUserDocument;
  return {
    busId: b._id.toString(),
    registrationNumber: b.registrationNumber,
    name: b.name,
    totalSeats: b.totalSeats,
    seatType: b.seatType,
    amenities: b.amenities,
    status: b.status,
    operatedBy: op._id.toString(),
    operatorName: op.name,
  };
}

export async function listBuses(): Promise<IAdminBusListResponse> {
  const buses = await Bus.find()
    .sort({ createdAt: -1 })
    .populate<{ operatedBy: IUserDocument }>('operatedBy', 'name email')
    .exec();

  const items: IAdminBusItem[] = buses.map((b) =>
    toBusItem(b as InstanceType<typeof Bus> & { operatedBy: IUserDocument }),
  );

  return { buses: items, count: items.length };
}

export async function createBus(body: ICreateBusRequest): Promise<IAdminBusItem> {
  const { registrationNumber, name, totalSeats, seatType, seatLayout, amenities, operatedBy } =
    body;

  if (!registrationNumber?.trim()) throw makeError('registrationNumber is required', 400);
  if (!name?.trim()) throw makeError('name is required', 400);
  if (!Number.isInteger(totalSeats) || totalSeats < 1)
    throw makeError('totalSeats must be a positive integer', 400);
  if (!['seater', 'sleeper', 'semi-sleeper'].includes(seatType))
    throw makeError('Invalid seatType', 400);
  if (!Array.isArray(seatLayout) || seatLayout.length === 0)
    throw makeError('seatLayout must be a non-empty array', 400);
  if (!Types.ObjectId.isValid(operatedBy)) throw makeError('Invalid operatedBy user ID', 400);

  const operator = await User.findById(operatedBy).exec();
  if (!operator) throw makeError('Operator user not found', 404);
  if (!['operator', 'admin'].includes(operator.role))
    throw makeError('User is not an operator or admin', 400);

  const existing = await Bus.findOne({ registrationNumber: registrationNumber.trim().toUpperCase() }).exec();
  if (existing) throw makeError('Registration number already in use', 409);

  const bus = await Bus.create({
    registrationNumber,
    name: name.trim(),
    totalSeats,
    seatType,
    seatLayout,
    amenities: amenities ?? [],
    operatedBy: new Types.ObjectId(operatedBy),
    status: 'active',
  });

  const populated = await Bus.findById(bus._id)
    .populate<{ operatedBy: IUserDocument }>('operatedBy', 'name email')
    .exec();

  return toBusItem(populated as InstanceType<typeof Bus> & { operatedBy: IUserDocument });
}

export async function updateBus(busId: string, body: IUpdateBusRequest): Promise<IAdminBusItem> {
  if (!Types.ObjectId.isValid(busId)) throw makeError('Invalid bus ID', 400);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) throw makeError('name cannot be empty', 400);
    updates['name'] = body.name.trim();
  }
  if (body.amenities !== undefined) updates['amenities'] = body.amenities;
  if (body.status !== undefined) {
    if (!['active', 'maintenance', 'retired'].includes(body.status))
      throw makeError('Invalid status', 400);
    updates['status'] = body.status;
  }
  if (Object.keys(updates).length === 0) throw makeError('No valid fields to update', 400);

  const bus = await Bus.findByIdAndUpdate(busId, { $set: updates }, { new: true })
    .populate<{ operatedBy: IUserDocument }>('operatedBy', 'name email')
    .exec();

  if (!bus) throw makeError('Bus not found', 404);
  return toBusItem(bus as InstanceType<typeof Bus> & { operatedBy: IUserDocument });
}

export async function deleteBus(busId: string): Promise<void> {
  if (!Types.ObjectId.isValid(busId)) throw makeError('Invalid bus ID', 400);
  const bus = await Bus.findByIdAndDelete(busId).exec();
  if (!bus) throw makeError('Bus not found', 404);
}
