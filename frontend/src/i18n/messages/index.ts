import account from './account'
import admin from './admin'
import audit from './audit'
import common from './common'
import content from './content'
import dashboard from './dashboard'
import employees from './employees'
import enums from './enums'
import expenses from './expenses'
import leave from './leave'
import organization from './organization'
import projects from './projects'
import reports from './reports'
import tasks from './tasks'

/** Every message area. Keys become the first segment of a translation key, e.g. t('common.actions.save'). */
export const modules = {
  account,
  admin,
  audit,
  common,
  content,
  dashboard,
  employees,
  enums,
  expenses,
  leave,
  organization,
  projects,
  reports,
  tasks,
}
