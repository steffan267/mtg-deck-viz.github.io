import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImportControls from '../../src/web/components/import/ImportControls.vue'

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('ImportControls', () => {
  it('imports a Moxfield URL from Enter without showing an add button', async () => {
    const wrapper = mount(ImportControls)

    expect(wrapper.text()).not.toContain('+ Add')

    await wrapper.find('input[type="text"]').setValue('https://moxfield.com/decks/example')
    await wrapper.find('input[type="text"]').trigger('keydown.enter')
    await flush()

    expect(wrapper.emitted('import')).toEqual([
      [{ kind: 'url', url: 'https://moxfield.com/decks/example' }],
    ])
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
  })

  it('preserves a submitted URL when the parent reports an import error', async () => {
    const wrapper = mount(ImportControls)

    await wrapper.find('input[type="text"]').setValue('https://moxfield.com/decks/bad')
    await wrapper.find('input[type="text"]').trigger('keydown.enter')
    await wrapper.setProps({ loading: true })
    await wrapper.setProps({ loading: false, error: 'Import failed' })
    await flush()

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('https://moxfield.com/decks/bad')
  })

  it('keeps pasted text open on failure and clears it on success', async () => {
    const wrapper = mount(ImportControls)

    await wrapper.find('[aria-label="More import options"]').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Paste list')!.trigger('click')
    await wrapper.find('textarea').setValue('1 Sol Ring')
    await wrapper.findAll('button').find(button => button.text() === 'Import pasted list')!.trigger('click')
    await wrapper.setProps({ loading: true })
    await wrapper.setProps({ loading: false, error: 'Parse failed' })
    await flush()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('1 Sol Ring')

    await wrapper.findAll('button').find(button => button.text() === 'Import pasted list')!.trigger('click')
    await wrapper.setProps({ loading: true, error: null })
    await wrapper.setProps({ loading: false, error: null })
    await flush()

    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})
