import { Types } from 'mongoose';

export type BusStatus = 'active' | 'maintenance' | 'retired';

export type SeatType = 'seater' | 'sleeper' | 'semi-sleeper';

export type DeckType = 'lower' | 'upper' | 'single';

export type SeatPositionType = 'window' | 'aisle' | 'middle';

export interface ISeatLayout {
  seatNumber: string;
  deck: DeckType;
  row: number;
  column: number;
  type: SeatPositionType;
  isFemaleSeat: boolean;
}

export interface IBus {
  registrationNumber: string;
  name: string;
  totalSeats: number;
  seatType: SeatType;
  seatLayout: ISeatLayout[];
  amenities: string[];
  status: BusStatus;
  operatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBusDocument extends IBus {
  _id: Types.ObjectId;
}
