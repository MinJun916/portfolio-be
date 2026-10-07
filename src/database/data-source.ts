import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from './options';

export const dataSourceOptions = getDataSourceOptions();
export default new DataSource(dataSourceOptions);
