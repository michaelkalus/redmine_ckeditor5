# frozen_string_literal: true

module RedmineCkeditor
  module MentionablePatch
    private

    def scan_for_mentioned_users(content)
      return super unless content && RedmineCkeditor.enabled?

      super(HtmlMentionText.call(content))
    end
  end
end
