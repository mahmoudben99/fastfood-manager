import { ipcMain } from 'electron'
import { categoriesRepo, type CreateCategoryInput } from '../database/repositories/categories.repo'

export function registerCategoriesHandlers(): void {
  ipcMain.handle('categories:getAll', () => {
    return categoriesRepo.getAll()
  })

  ipcMain.handle('categories:getById', (_, id: number) => {
    return categoriesRepo.getById(id)
  })

  ipcMain.handle('categories:create', (_, input: CreateCategoryInput) => {
    return categoriesRepo.create(input)
  })

  ipcMain.handle('categories:update', (_, id: number, input: Partial<CreateCategoryInput>) => {
    return categoriesRepo.update(id, input)
  })

  ipcMain.handle('categories:delete', (_, id: number) => {
    return categoriesRepo.delete(id)
  })

  ipcMain.handle('categories:reorder', (_, orderedIds: number[]) => {
    categoriesRepo.reorder(orderedIds)
    return true
  })

  ipcMain.handle('categories:createMany', (_, inputs: CreateCategoryInput[]) => {
    return categoriesRepo.createMany(inputs)
  })
}
