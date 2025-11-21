import { Containers } from 'src/services/containers'
import * as IPC from 'src/services/ipc'
import * as Logs from 'src/services/logs'
import { Tabs } from 'src/services/tabs.bg'
import { Windows } from 'src/services/windows'
import { Container, InstanceType } from 'src/types'

function setupListeners() {
  browser.omnibox.setDefaultSuggestion({ description: 'Type the name of the container you want for this tab…' })

  function matchContainers(input: string): Container[] {
    // TODO: order by score of some sort?
    // TODO: At the very least, put an exact match first.
    // TODO: Validate we want Sidebery records, not Firefox records.
    return Object.values(Containers.reactive.byId).filter(container =>
      container.name.toLowerCase().includes(input.toLowerCase())
    )
  }

  browser.omnibox.onInputChanged.addListener(async (input, suggest) => {
    const suggestions = matchContainers(input).map(ctx => ({
      content: ctx.name,
      description: ctx.name,
      deletable: false,
    }))
    suggest(suggestions)
  })

  browser.omnibox.onInputEntered.addListener(async (input, _disposition) => {
    // NOTE: We're semantically _re-opening_ tabs, which conflicts with a disposition. Ignore it.

    if (!Windows.lastFocusedWinId) {
      Logs.err('omnibox: no last focused window ID found')
      return
    }

    const matchingContainers = matchContainers(input)
    if (matchingContainers.length <= 0) {
      Logs.warn('omnibox: no matching containers found')
      return
    }
    const firstMatchingContainer = matchingContainers[0]

    const sidebarTabs = await Tabs.getSidebarTabs(Windows.lastFocusedWinId)
    if (!sidebarTabs) {
      Logs.err('omnibox: no sidebar tabs found for last focused window ID')
      return
    }

    const con = IPC.getConnection(InstanceType.sidebar, Windows.lastFocusedWinId)
    if ((con?.localPort && con.localPort.error) || (con?.remotePort && con.remotePort.error)) {
      Logs.err('need to fall back to creating tabs by hand')
      return
    }

    const activeTabs = sidebarTabs.filter(tab => tab.active)
    try {
      await IPC.sidebar(
        Windows.lastFocusedWinId,
        'reopenInContainer',
        activeTabs.map(tab => tab.id),
        firstMatchingContainer.id
      )
    } catch {
      console.warn('failed to re-open tabs', activeTabs, 'in container', firstMatchingContainer)
    }
  })
}

export { setupListeners }
