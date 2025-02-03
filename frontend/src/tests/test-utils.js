import { render } from '@testing-library/react'

const customRender = (ui, options = {}) => {
  return render(ui, {
    ...options,
  })
}

export * from '@testing-library/react'
export { customRender as render }