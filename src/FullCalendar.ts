import Vue, { PropType } from 'vue'
import { Calendar, CalendarOptions } from '@fullcalendar/core'
import { CustomRendering, CustomRenderingStore } from '@fullcalendar/core/internal'
import { OPTION_IS_COMPLEX } from './options.js'
import { shallowCopy } from './utils.js'
import Teleport from './Teleport.js'

const FullCalendar = Vue.extend({
  props: {
    options: Object as PropType<CalendarOptions>
  },

  data() {
    return {
      renderId: 0,
      customRenderings: [] as Iterable<CustomRendering<any>>
    }
  },

  methods: {
    getApi(): Calendar {
      return getSecret(this).calendar
    },

    buildOptions(suppliedOptions: CalendarOptions | undefined): CalendarOptions {
      return {
        ...suppliedOptions,
        customRenderingMetaMap: this.$scopedSlots,
        handleCustomRendering: getSecret(this).handleCustomRendering,
      }
    },
  },

  render(createElement) {
    return createElement(
      'div',
      {
        // when renderId is changed, Vue will trigger a real-DOM async rerender, calling beforeUpdate/updated
        attrs: { 'data-fc-render-id': this.renderId }
      },
      [
        createElement(
          'div', // for containing Teleport keys
          { style: { display: 'none' } },
          Array.from(this.customRenderings).map((customRendering) => {
            return createElement(
              Teleport,
              {
                key: customRendering.id,
                props: {
                  to: customRendering.containerEl
                }
              },
              customRendering.generatorMeta( // a slot-render-function
                customRendering.renderProps
              )
            )
          }),
        )
      ]
    )
  },

  mounted() {
    const customRenderingStore = new CustomRenderingStore<any>()
    getSecret(this).handleCustomRendering = customRenderingStore.handle.bind(customRenderingStore)

    const calendarOptions = this.buildOptions(this.options)
    const calendar = new Calendar(this.$el as HTMLElement, calendarOptions)
    getSecret(this).calendar = calendar

    calendar.render()
    customRenderingStore.subscribe((customRenderings) => {
      this.customRenderings = customRenderings
    })
  },

  beforeUpdate() {
    this.getApi().resumeRendering() // the watcher handlers paused it
  },

  beforeDestroy() {
    this.getApi().destroy()
  },

  watch: buildWatchers()
})

export default FullCalendar

// Internals

type FullCalendarInstance = InstanceType<typeof FullCalendar>

interface FullCalendarSecret {
  calendar: Calendar
  handleCustomRendering: (customRendering: CustomRendering<any>) => void
}

// storing internal state:
// https://github.com/vuejs/vue/issues/1988#issuecomment-163013818
function getSecret(inst: FullCalendarInstance): FullCalendarSecret {
  return inst as any as FullCalendarSecret
}

function buildWatchers() {

  let watchers: { [member: string]: any } = {

    // watches changes of ALL options and their nested objects,
    // but this is only a means to be notified of top-level non-complex options changes.
    options: {
      deep: true,
      handler(this: FullCalendarInstance, options: CalendarOptions) {
        let calendar = this.getApi()
        calendar.pauseRendering()

        let calendarOptions = this.buildOptions(options)
        calendar.resetOptions(calendarOptions)

        this.renderId++ // will queue a rerender
      }
    }
  }

  for (let complexOptionName in OPTION_IS_COMPLEX) {

    // handlers called when nested objects change
    watchers[`options.${complexOptionName}`] = {
      deep: true,
      handler(this: FullCalendarInstance, val: any) {

        // unfortunately the handler is called with undefined if new props were set, but the complex one wasn't ever set
        if (val !== undefined) {

          let calendar = this.getApi()
          calendar.pauseRendering()
          calendar.resetOptions({
            // the only reason we shallow-copy is to trick FC into knowing there's a nested change.
            // TODO: future versions of FC will more gracefully handle event option-changes that are same-reference.
            [complexOptionName]: shallowCopy(val)
          }, true)

          this.renderId++ // will queue a rerender
        }
      }
    }
  }

  return watchers
}
