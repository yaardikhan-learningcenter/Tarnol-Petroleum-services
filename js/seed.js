// Starter data taken from the Tarnol Filling Station workbook (names, nozzles, oil list, opening oil stock).
// Opening oil batches are loaded with cost 0 - edit them on the Purchases page (supplier "OPENING") to set real cost.
const oil = [ // [name, unit, saleRate, openingQty]
 ['Open Oil','Liter',800,98],['R2*1','Quarter',1401,80],['R2*4','Pack',5488,74],['R2*10','Pack',13694,44],
 ['R1*1','Pack',0,62],['R1*4','Pack',0,34],['R1*10','Pack',0,23],['Ax3.07','Pack',879,108],['Ax3.1','Pack',0,32],
 ['Hx3*1','Pack',0,62],['Hx3*3','Pack',4652,33],['Hx3*4','Pack',0,21],['Hx6*3','Pack',0,0],['Hx6*4','Pack',0,26],
 ['B Oil','Pack',400,90],['FL','Pack',0,6],['AC 0.72','Pack',0,34],['DF','Pack',0,19],['SU F','Pack',0,24],
 ['CRL','Pack',0,11],['TF','Pack',950,20],['MF','Pack',0,6],['TH','Pack',750,5],['DT','Pack',200,410],
 ['ATF','Pack',0,13],['GTO','Pack',0,18],['GDF','Pack',0,6]];
export const SEED = {
  items: [{ name: 'PETROL', type: 'fuel', unit: 'Liter', rate: 300.78 }, { name: 'DIESEL', type: 'fuel', unit: 'Liter', rate: 312.75 },
    ...oil.map(o => ({ name: o[0], type: 'oil', unit: o[1], rate: o[2] }))],
  nozzles: [...[1, 2, 3, 4].map(i => ({ name: 'Petrol NZ ' + i, item: 'PETROL' })), ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ name: 'Diesel NZ ' + i, item: 'DIESEL' }))],
  customers: ['Sardar','Tariq Sb','Sarhad Goods','Haji Gul Faraz','Awan Brothers','Waqar','Haji Khalid Waris','Afridi United','Malik Ijaz','Haji Mazhar','Malak','Adnan','Subhan','Shahid Parcel','Waseem Godam','Tariq Sb Godam','Tarnol Center','Abrar Mistri','Bangus Cargo','Imran Trd','Ayaan Enter','SPG Karachi','Zameer Abbasi','Javaid','Mahmood'].map(name => ({ name, opening: 0 })),
  suppliers: [{ name: 'Shell', opening: 0 }],
  employees: [['Nazakat','Pump Attendant'],['Imran','Pump Attendant'],['Nisar','Pump Attendant'],['Atif Aslam','Staff'],['Abdu Rahman','Staff'],['Waseem','Staff'],['Saqlain','Staff'],['Ahmad Bhatti','Staff'],['Abbas','Staff'],['Ghauri','Guard']].map(([name, designation]) => ({ name, designation, salary: 0 })),
  openingOil: oil.filter(o => o[3] > 0).map(o => ({ item: o[0], qty: o[3] })),
};
