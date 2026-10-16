# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorHtmlMentionTextTest < ActiveSupport::TestCase
  def text(html) = RedmineCkeditor::HtmlMentionText.call(html)

  def test_returns_visible_text_with_block_breaks
    assert_equal "\nHello @jsmith\n\nsecond\n", text('<p>Hello <b>@jsmith</b></p><p>second</p>')
  end

  def test_drops_pre_code_blockquote_and_attributes
    result = text('<blockquote><p>@a</p></blockquote><pre>@b</pre><p><code>@c</code> x</p><span data-mention="@d" title="@e">y</span>')

    refute_match(/@[a-e]/, result)
    assert_includes result, 'x'
    assert_includes result, 'y'
  end

  def test_decodes_entities_and_handles_blank
    assert_includes text('<p>A &amp; B</p>'), 'A & B'
    assert_equal '', text(nil)
    assert_equal '', text('')
  end
end
